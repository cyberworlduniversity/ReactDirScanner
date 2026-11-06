const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('node:crypto');
const { resolvePublicTarget, createPinnedAgents } = require('./target-safety');

const app = express();
app.use(cors());
app.use(express.json({ limit: '32kb' }));

const DEFAULT_WORDLIST = [
  'admin', 'administrator', 'login', 'panel', 'dashboard',
  'backup', 'backups', 'bak', 'old', 'archive',
  'config', 'configuration', 'conf', 'settings',
  'api', 'api/v1', 'api/v2', 'rest', 'graphql',
  'uploads', 'upload', 'files', 'file', 'media',
  'images', 'img', 'static', 'assets', 'public',
  'private', 'secret', 'hidden', 'internal',
  'test', 'testing', 'dev', 'development', 'staging',
  'wp-admin', 'wp-content', 'wp-includes', 'wordpress',
  'phpmyadmin', 'pma', 'mysql', 'database', 'db',
  'server-status', 'server-info', '.env', '.git',
  'robots.txt', 'sitemap.xml', '.htaccess', 'web.config',
  'users', 'user', 'profile', 'account', 'accounts',
  'register', 'signup', 'signin', 'logout', 'auth',
  'cgi-bin', 'scripts', 'bin', 'logs', 'log',
  'tmp', 'temp', 'cache', 'data', 'store',
  'download', 'downloads', 'export', 'exports',
  'report', 'reports', 'stats', 'statistics',
  'portal', 'gateway', 'secure', 'ssl',
  'backup.zip', 'backup.sql', 'dump.sql', 'database.sql',
  'index.php', 'index.html', 'README', 'CHANGELOG',
];

const scanSessions = Object.create(null);

app.post('/api/scan/start', (req, res) => {
  const { target, customWordlist, timeout = 5000, concurrency = 10 } = req.body || {};
  if (typeof target !== 'string' || !target.trim()) {
    return res.status(400).json({ error: 'A target URL is required' });
  }
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 15000) {
    return res.status(400).json({ error: 'Timeout must be between 1000 and 15000 milliseconds' });
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 25) {
    return res.status(400).json({ error: 'Concurrency must be between 1 and 25' });
  }

  const wordlist = Array.isArray(customWordlist) && customWordlist.length
    ? customWordlist
    : DEFAULT_WORDLIST;
  if (wordlist.length > 1000 || wordlist.some((item) =>
    typeof item !== 'string' || !item.trim() || item.length > 200 ||
    item.startsWith('/') || item.includes('\\') || item.split('/').includes('..') ||
    /[\\u0000-\\u001f]/.test(item)
  )) {
    return res.status(400).json({ error: 'Wordlist must contain at most 1000 safe relative paths' });
  }

  const sessionId = crypto.randomUUID();
  scanSessions[sessionId] = {
    target: target.trim(), wordlist, timeout, concurrency,
    status: 'running', results: [], progress: 0,
    total: wordlist.length, startTime: Date.now(), errors: [],
  };

  runScan(sessionId);
  res.json({ sessionId, total: wordlist.length });
});

app.get('/api/scan/status/:sessionId', (req, res) => {
  const session = scanSessions[req.params.sessionId];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({
    status: session.status, results: session.results,
    progress: session.progress, total: session.total,
    errors: session.errors, elapsed: Date.now() - session.startTime,
  });
});

app.post('/api/scan/stop/:sessionId', (req, res) => {
  const session = scanSessions[req.params.sessionId];
  if (session) { session.status = 'stopped'; res.json({ message: 'Scan stopped' }); }
  else res.status(404).json({ error: 'Session not found' });
});

app.get('/api/wordlist', (req, res) => {
  res.json({ wordlist: DEFAULT_WORDLIST, count: DEFAULT_WORDLIST.length });
});

async function runScan(sessionId) {
  const session = scanSessions[sessionId];
  let target;
  try {
    target = await resolvePublicTarget(session.target);
  } catch (error) {
    session.status = 'failed';
    session.errors.push({ error: error.message || 'Target validation failed' });
    return;
  }

  const agents = createPinnedAgents(target);
  const baseUrl = target.url.toString().replace(/\/+$/, '');

  for (let i = 0; i < session.wordlist.length; i += session.concurrency) {
    if (session.status !== 'running') break;
    const chunk = session.wordlist.slice(i, i + session.concurrency);
    const results = await Promise.allSettled(
      chunk.map((path) => checkPath(baseUrl, path, session.timeout, agents))
    );
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        const data = result.value;
        if (data.found) session.results.push(data);
        if (data.error) session.errors.push({ path: chunk[idx], error: data.error });
      } else if (result.status === 'rejected') {
        session.errors.push({ path: chunk[idx], error: 'Request failed' });
      }
      session.progress++;
    });
  }
  if (session.status === 'running') session.status = 'completed';
  agents.httpAgent.destroy();
  agents.httpsAgent.destroy();
}

async function checkPath(baseUrl, path, timeout, agents) {
  const url = new URL(path, baseUrl + '/');
  if (url.origin !== new URL(baseUrl).origin) {
    return { path, found: false, error: 'Path must remain on the validated target origin' };
  }
  const startTime = Date.now();
  try {
    const response = await axios.get(url.toString(), {
      timeout,
      maxRedirects: 0,
      maxContentLength: 65536,
      responseType: 'stream',
      validateStatus: () => true,
      httpAgent: agents.httpAgent,
      httpsAgent: agents.httpsAgent,
      headers: { 'User-Agent': 'ReactDirScanner/1.0 (Security Testing Tool)' },
    });
    const contentLength = response.headers['content-length']
      ? parseInt(response.headers['content-length'], 10)
      : null;
    if (response.data && typeof response.data.destroy === 'function') {
      response.data.destroy();
    }
    return {
      path, url: url.toString(), status: response.status, statusText: response.statusText,
      size: Number.isFinite(contentLength) ? contentLength : null,
      responseTime: Date.now() - startTime,
      contentType: response.headers['content-type'] || 'unknown',
      found: response.status !== 404,
    };
  } catch (error) {
    return { path, url: url.toString(), found: false, error: 'Request failed or timed out' };
  }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`ReactDirScanner backend running on port ${PORT}`));

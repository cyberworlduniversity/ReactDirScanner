const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

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

const scanSessions = {};

app.post('/api/scan/start', (req, res) => {
  const { target, customWordlist, timeout = 5000, concurrency = 10 } = req.body;
  if (!target) return res.status(400).json({ error: 'Target URL is required' });

  const sessionId = Date.now().toString();
  const wordlist = customWordlist && customWordlist.length > 0 ? customWordlist : DEFAULT_WORDLIST;

  scanSessions[sessionId] = {
    target, wordlist, timeout, concurrency,
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
  let baseUrl = session.target.trim();
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) baseUrl = 'https://' + baseUrl;
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

  for (let i = 0; i < session.wordlist.length; i += session.concurrency) {
    if (session.status !== 'running') break;
    const chunk = session.wordlist.slice(i, i + session.concurrency);
    const results = await Promise.allSettled(chunk.map(p => checkPath(baseUrl, p, session.timeout)));
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        const data = result.value;
        if (data.found) session.results.push(data);
        if (data.error) session.errors.push({ path: chunk[idx], error: data.error });
      }
      session.progress++;
    });
  }
  if (session.status === 'running') session.status = 'completed';
}

async function checkPath(baseUrl, path, timeout) {
  const url = `${baseUrl}/${path}`;
  const startTime = Date.now();
  try {
    const response = await axios.get(url, {
      timeout, maxRedirects: 5, validateStatus: () => true,
      headers: { 'User-Agent': 'ReactDirScanner/1.0 (Security Testing Tool)' },
    });
    const contentLength = response.headers['content-length']
      ? parseInt(response.headers['content-length'])
      : (response.data ? JSON.stringify(response.data).length : 0);
    return {
      path, url, status: response.status, statusText: response.statusText,
      size: contentLength, responseTime: Date.now() - startTime,
      contentType: response.headers['content-type'] || 'unknown',
      found: response.status !== 404,
    };
  } catch (error) {
    return { path, url, found: false, error: error.message };
  }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`ReactDirScanner backend running on port ${PORT}`));

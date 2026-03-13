import { useState, useEffect, useRef } from "react";

const API_BASE = "http://localhost:3001/api";

const statusColor = (code) => {
  if (code >= 200 && code < 300) return "#00ff88";
  if (code >= 300 && code < 400) return "#ffaa00";
  if (code === 403) return "#ff6600";
  if (code >= 500) return "#ff3333";
  return "#aaaaaa";
};

export default function App() {
  const [target, setTarget] = useState("");
  const [customWordlist, setCustomWordlist] = useState("");
  const [concurrency, setConcurrency] = useState(10);
  const [timeout, setTimeout_] = useState(5000);
  const [sessionId, setSessionId] = useState(null);
  const [scanData, setScanData] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const intervalRef = useRef(null);

  const startScan = async () => {
    if (!target) return alert("Please enter a target URL");
    const wordlist = customWordlist
      ? customWordlist.split("\n").map((w) => w.trim()).filter(Boolean)
      : [];
    try {
      const res = await fetch(`${API_BASE}/scan/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, customWordlist: wordlist, concurrency, timeout }),
      });
      const data = await res.json();
      setSessionId(data.sessionId);
      setScanning(true);
      setScanData({ status: "running", results: [], progress: 0, total: data.total, elapsed: 0, errors: [] });
    } catch (e) {
      alert("Failed to connect to backend. Make sure the server is running on port 3001.");
    }
  };

  const stopScan = async () => {
    if (!sessionId) return;
    await fetch(`${API_BASE}/scan/stop/${sessionId}`, { method: "POST" });
    setScanning(false);
  };

  const exportCSV = () => {
    if (!scanData?.results?.length) return;
    const header = "Path,URL,Status,Size (bytes),Response Time (ms),Content-Type\n";
    const rows = scanData.results
      .map((r) => `${r.path},${r.url},${r.status},${r.size},${r.responseTime},${r.contentType}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scan-results-${Date.now()}.csv`;
    a.click();
  };

  useEffect(() => {
    if (scanning && sessionId) {
      intervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/scan/status/${sessionId}`);
          const data = await res.json();
          setScanData(data);
          if (data.status === "completed" || data.status === "stopped") {
            setScanning(false);
            clearInterval(intervalRef.current);
          }
        } catch (e) {
          clearInterval(intervalRef.current);
          setScanning(false);
        }
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [scanning, sessionId]);

  const filteredResults = scanData?.results?.filter((r) => {
    if (filterStatus === "all") return true;
    if (filterStatus === "2xx") return r.status >= 200 && r.status < 300;
    if (filterStatus === "3xx") return r.status >= 300 && r.status < 400;
    if (filterStatus === "403") return r.status === 403;
    if (filterStatus === "5xx") return r.status >= 500;
    return true;
  }) || [];

  const progressPercent = scanData ? Math.round((scanData.progress / scanData.total) * 100) : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#c9d1d9", fontFamily: "monospace", padding: "20px" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "30px" }}>
        <h1 style={{ color: "#00ff88", fontSize: "2rem", margin: 0 }}>⚡ ReactDirScanner</h1>
        <p style={{ color: "#8b949e", margin: "5px 0" }}>Hidden Directory & File Finder | Inspired by DirBuster</p>
        <p style={{ color: "#ff6600", fontSize: "0.75rem" }}>⚠️ Use only on websites you own or have explicit permission to test</p>
      </div>

      {/* Config Panel */}
      <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", padding: "20px", marginBottom: "20px" }}>
        <h2 style={{ color: "#58a6ff", marginTop: 0 }}>🎯 Scan Configuration</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ color: "#8b949e", fontSize: "0.85rem" }}>TARGET URL</label>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="https://example.com"
              style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", color: "#c9d1d9", padding: "10px", borderRadius: "6px", fontSize: "1rem", boxSizing: "border-box", marginTop: "5px" }}
            />
          </div>
          <div>
            <label style={{ color: "#8b949e", fontSize: "0.85rem" }}>CONCURRENCY</label>
            <input
              type="number" value={concurrency} min={1} max={50}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", color: "#c9d1d9", padding: "10px", borderRadius: "6px", fontSize: "1rem", boxSizing: "border-box", marginTop: "5px" }}
            />
          </div>
          <div>
            <label style={{ color: "#8b949e", fontSize: "0.85rem" }}>TIMEOUT (ms)</label>
            <input
              type="number" value={timeout} min={1000} max={30000} step={500}
              onChange={(e) => setTimeout_(Number(e.target.value))}
              style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", color: "#c9d1d9", padding: "10px", borderRadius: "6px", fontSize: "1rem", boxSizing: "border-box", marginTop: "5px" }}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ color: "#8b949e", fontSize: "0.85rem" }}>CUSTOM WORDLIST (one path per line, leave empty for default)</label>
            <textarea
              value={customWordlist}
              onChange={(e) => setCustomWordlist(e.target.value)}
              placeholder={"admin\nlogin\nbackup\nconfig\n..."}
              rows={4}
              style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", color: "#c9d1d9", padding: "10px", borderRadius: "6px", fontSize: "0.9rem", boxSizing: "border-box", marginTop: "5px", resize: "vertical" }}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
          <button
            onClick={startScan} disabled={scanning}
            style={{ background: scanning ? "#21262d" : "#238636", color: "#fff", border: "none", padding: "12px 25px", borderRadius: "6px", cursor: scanning ? "not-allowed" : "pointer", fontWeight: "bold", fontSize: "1rem" }}
          >
            {scanning ? "⏳ Scanning..." : "🚀 Start Scan"}
          </button>
          <button
            onClick={stopScan} disabled={!scanning}
            style={{ background: scanning ? "#da3633" : "#21262d", color: "#fff", border: "none", padding: "12px 25px", borderRadius: "6px", cursor: scanning ? "pointer" : "not-allowed", fontWeight: "bold", fontSize: "1rem" }}
          >
            ⛔ Stop Scan
          </button>
          <button
            onClick={exportCSV} disabled={!scanData?.results?.length}
            style={{ background: "#1f6feb", color: "#fff", border: "none", padding: "12px 25px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "1rem", marginLeft: "auto" }}
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {/* Progress */}
      {scanData && (
        <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", padding: "20px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
            <span>Progress: {scanData.progress} / {scanData.total} paths</span>
            <span style={{ color: scanData.status === "completed" ? "#00ff88" : scanData.status === "stopped" ? "#ff6600" : "#ffaa00" }}>
              ● {scanData.status?.toUpperCase()}
            </span>
            <span>Found: {scanData.results?.length || 0}</span>
            <span>Time: {((scanData.elapsed || 0) / 1000).toFixed(1)}s</span>
          </div>
          <div style={{ background: "#21262d", borderRadius: "4px", height: "12px", overflow: "hidden" }}>
            <div style={{ background: "#00ff88", height: "100%", width: `${progressPercent}%`, transition: "width 0.3s" }} />
          </div>
          <div style={{ textAlign: "center", fontSize: "0.8rem", color: "#8b949e", marginTop: "5px" }}>{progressPercent}%</div>
        </div>
      )}

      {/* Results */}
      {scanData?.results?.length > 0 && (
        <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "15px", flexWrap: "wrap" }}>
            <h2 style={{ color: "#58a6ff", margin: 0 }}>📋 Results ({filteredResults.length})</h2>
            {["all", "2xx", "3xx", "403", "5xx"].map((f) => (
              <button key={f} onClick={() => setFilterStatus(f)}
                style={{ background: filterStatus === f ? "#1f6feb" : "#21262d", color: "#fff", border: "none", padding: "5px 12px", borderRadius: "4px", cursor: "pointer", fontSize: "0.8rem" }}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #30363d", color: "#8b949e" }}>
                  <th style={{ padding: "8px", textAlign: "left" }}>PATH</th>
                  <th style={{ padding: "8px", textAlign: "left" }}>STATUS</th>
                  <th style={{ padding: "8px", textAlign: "left" }}>SIZE</th>
                  <th style={{ padding: "8px", textAlign: "left" }}>TIME</th>
                  <th style={{ padding: "8px", textAlign: "left" }}>CONTENT TYPE</th>
                  <th style={{ padding: "8px", textAlign: "left" }}>URL</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #21262d" }}>
                    <td style={{ padding: "8px", color: "#00ff88" }}>/{r.path}</td>
                    <td style={{ padding: "8px" }}>
                      <span style={{ background: statusColor(r.status) + "22", color: statusColor(r.status), padding: "2px 8px", borderRadius: "4px", fontWeight: "bold" }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: "8px" }}>{r.size ? `${r.size} B` : "-"}</td>
                    <td style={{ padding: "8px" }}>{r.responseTime}ms</td>
                    <td style={{ padding: "8px", color: "#8b949e", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis" }}>{r.contentType?.split(";")[0]}</td>
                    <td style={{ padding: "8px" }}>
                      <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "#58a6ff" }}>{r.url}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: "20px", color: "#30363d", fontSize: "0.75rem" }}>
        ReactDirScanner v1.0 | For authorized security testing only
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, use, useRef } from "react";
import Link from "next/link";
import { useMe } from "@/lib/useMe";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import {
  ArrowLeftIcon as ArrowLeft,
  PlayIcon as Play,
  HistoryIcon as History,
  CircleCheckIcon as CheckCircle2,
} from "lucide-animated";

interface QueryResult {
  statementKind: "read" | "write";
  command: string | null;
  columns: string[];
  rows: (string | null)[][];
  rowCount: number;
  returnedRows: number;
  truncated: boolean;
  durationMs: number;
  statementCount: number;
}

interface QueryLog {
  id: string;
  sql_text: string;
  statement_kind: "read" | "write";
  status: "success" | "error";
  row_count: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

export default function ConsolePage({ params }: { params: Promise<{ connectionId: string }> }) {
  const { can } = useMe();
  const canWrite = can("dbx.console", "EDIT");
  const { connectionId } = use(params);

  const [connection, setConnection] = useState<any>(null);
  const [sql, setSql] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmPrompt, setConfirmPrompt] = useState<string | null>(null);

  const [logs, setLogs] = useState<QueryLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/connections")
      .then(r => r.json())
      .then(list => setConnection(list.find((c: any) => String(c.id) === connectionId) || null))
      .catch(() => {});
  }, [connectionId]);

  const fetchLogs = async () => {
    try {
      setLoadingLogs(true);
      const res = await fetch(`/api/connections/${connectionId}/query/logs`);
      const data = await res.json();
      setLogs(data.logs || []);
      setLogsTotal(data.total || 0);
    } catch (err) {
      console.error("Failed to load query history", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [connectionId]);

  const runQuery = async (confirmed = false) => {
    if (!sql.trim() || running) return;
    setRunning(true);
    setError(null);
    setConfirmPrompt(null);

    try {
      const res = await fetch(`/api/connections/${connectionId}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql, confirmed }),
      });
      const data = await res.json();

      if (res.status === 409 && data.requiresConfirmation) {
        setConfirmPrompt(data.message);
        setResult(null);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Query failed");
        setResult(null);
        return;
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message);
      setResult(null);
    } finally {
      setRunning(false);
      fetchLogs();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl+Enter runs, matching the convention in most SQL clients.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery(false);
    }
  };

  const clearHistory = async () => {
    if (!window.confirm("Clear the query history for this connection?")) return;
    await fetch(`/api/connections/${connectionId}/query/logs`, { method: "DELETE" });
    fetchLogs();
  };

  return (
    <div className="container-wide">
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem", marginTop: "1rem" }}>
        <Link href={`/${connectionId}`} className="btn btn-icon btn-outline"><ArrowLeft size={20} /></Link>
        <div>
          <div className="breadcrumb">
            <Link href="/">Connections</Link>
            <span>/</span>
            <Link href={`/${connectionId}`}>{connection?.name ?? "…"}</Link>
            <span>/</span>
            <span style={{ color: "var(--text-primary)" }}>Query Console</span>
          </div>
          <h1 style={{ marginBottom: "0.1rem" }}>Query Console</h1>
          {connection && (
            <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "0.8rem", fontFamily: "monospace" }}>
              {connection.host}:{connection.port} / {connection.database_name}
            </p>
          )}
        </div>
      </div>

      {/* Editor */}
      <div style={{ marginBottom: "1rem" }}>
        <textarea
          ref={textareaRef}
          className="input-field"
          value={sql}
          onChange={e => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="SELECT * FROM v3_t_master_platforms LIMIT 10;"
          spellCheck={false}
          style={{ width: "100%", minHeight: "160px", fontFamily: "monospace", fontSize: "0.85rem", resize: "vertical" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => runQuery(false)} disabled={running || !sql.trim()}>
            {running ? <Loader2 size={16} className="spin" /> : <Play size={16} />} Run
          </button>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>⌘/Ctrl + Enter</span>
          {!canWrite && (
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Read-only access: statements that modify data are blocked.</span>
          )}

          <div style={{ flex: 1 }} />

          <button className="btn btn-outline" onClick={() => { setShowHistory(s => !s); if (!showHistory) fetchLogs(); }}>
            <History size={16} /> History{logsTotal > 0 ? ` (${logsTotal})` : ""}
          </button>
        </div>
      </div>

      {/* Write confirmation */}
      {confirmPrompt && (
        <div
          className="glass-card"
          style={{ padding: "1rem", marginBottom: "1rem", borderColor: "rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.08)" }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
            <AlertTriangle size={20} style={{ color: "#f59e0b", flexShrink: 0, marginTop: "2px" }} />
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", marginBottom: "0.25rem" }}>This statement can modify data or schema</strong>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0 }}>{confirmPrompt}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", justifyContent: "flex-end" }}>
            <button className="btn btn-outline" onClick={() => setConfirmPrompt(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => runQuery(true)} disabled={running}>
              {running ? "Running…" : "Run anyway"}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="glass-card"
          style={{ padding: "1rem", marginBottom: "1rem", borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)" }}
        >
          <strong style={{ color: "#f87171", display: "block", marginBottom: "0.25rem" }}>Query failed</strong>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{error}</pre>
        </div>
      )}

      {/* Results */}
      {result && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.6rem", fontSize: "0.8rem", color: "var(--text-secondary)", flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#4ade80" }}>
              <CheckCircle2 size={14} /> {result.command || "OK"}
            </span>
            <span><strong style={{ color: "#e2e8f0" }}>{result.rowCount}</strong> row{result.rowCount === 1 ? "" : "s"}</span>
            <span><strong style={{ color: "#e2e8f0" }}>{result.durationMs}</strong> ms</span>
            {result.statementCount > 1 && <span>{result.statementCount} statements</span>}
            {result.truncated && (
              <span style={{ color: "#f59e0b" }}>showing first {result.returnedRows} rows only</span>
            )}
          </div>

          {result.columns.length > 0 ? (
            <div className="table-container" style={{ maxHeight: "55vh", overflow: "auto" }}>
              <table>
                <thead>
                  <tr>{result.columns.map((c, i) => <th key={`${c}-${i}`}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {result.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          title={cell ?? "null"}
                          style={{
                            maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            color: cell === null ? "#475569" : undefined,
                            fontFamily: "monospace", fontSize: "0.78rem",
                          }}
                        >
                          {cell === null ? "null" : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "1.5rem" }}>
              Statement completed — no rows returned.
            </div>
          )}
        </div>
      )}

      {/* History */}
      {showHistory && (
        <div style={{ marginTop: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem" }}>
            <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Query History</h2>
            {canWrite && (
              <button className="btn btn-outline" onClick={clearHistory} disabled={logs.length === 0}>
                <Trash2 size={14} /> Clear History
              </button>
            )}
          </div>

          {loadingLogs ? (
            <div className="empty-state"><Loader2 size={16} className="spin" /> Loading history…</div>
          ) : logs.length === 0 ? (
            <div className="empty-state">No queries run against this connection yet.</div>
          ) : (
            <div className="table-container" style={{ maxHeight: "45vh", overflow: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "150px" }}>When</th>
                    <th style={{ width: "70px" }}>Kind</th>
                    <th style={{ width: "80px" }}>Status</th>
                    <th style={{ width: "70px" }}>Rows</th>
                    <th style={{ width: "70px" }}>Time</th>
                    <th>SQL</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr
                      key={log.id}
                      onClick={() => { setSql(log.sql_text); textareaRef.current?.focus(); }}
                      style={{ cursor: "pointer" }}
                      title="Click to load this query into the editor"
                    >
                      <td style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>{new Date(log.created_at).toLocaleString()}</td>
                      <td>
                        <span style={{
                          fontSize: "0.68rem", fontWeight: 600, padding: "0.1rem 0.4rem", borderRadius: "999px",
                          background: log.statement_kind === "write" ? "rgba(245,158,11,0.15)" : "rgba(96,165,250,0.15)",
                          color: log.statement_kind === "write" ? "#f59e0b" : "#60a5fa", textTransform: "uppercase",
                        }}>{log.statement_kind}</span>
                      </td>
                      <td style={{ color: log.status === "success" ? "#4ade80" : "#f87171", fontSize: "0.78rem" }}>{log.status}</td>
                      <td style={{ fontSize: "0.78rem" }}>{log.row_count ?? "—"}</td>
                      <td style={{ fontSize: "0.78rem" }}>{log.duration_ms != null ? `${log.duration_ms}ms` : "—"}</td>
                      <td
                        title={log.error_message ? `${log.sql_text}\n\nError: ${log.error_message}` : log.sql_text}
                        style={{ maxWidth: "420px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: "0.76rem" }}
                      >
                        {log.sql_text.replace(/\s+/g, " ").trim()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

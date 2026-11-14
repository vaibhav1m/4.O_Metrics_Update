"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Trash2, Pencil, Server, XCircle, Loader2 } from "lucide-react";
// A few icons on this page use lucide-animated for a hover flourish; the rest
// (Trash2, Pencil, Server, XCircle, and the spinning Loader2) stay on
// lucide-react — either lucide-animated doesn't have them, or (for Loader2)
// the icon needs a continuous CSS spin rather than a one-shot hover animation.
import { useMe } from "@/lib/useMe";
import { DatabaseIcon as Database, PlusIcon as Plus, CircleCheckIcon as CheckCircle2 } from "lucide-animated";

const EMPTY_FORM = {
  name: "",
  type: "postgres",
  host: "",
  port: "5432",
  database_name: "",
  username: "",
  password: "",
};

export default function Home() {
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const { can } = useMe();
  const canEditConnections = can("dbx.connections", "EDIT");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    if (!isModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setIsModalOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isModalOpen]);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/connections");
      const data = await res.json();
      if (!res.ok) { setListError(data?.error || "Could not load connections"); setConnections([]); }
      else { setListError(""); setConnections(data); }
    } catch (err) {
      console.error("Failed to load connections", err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setIsEditMode(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setError("");
    setTestStatus("idle");
    setIsModalOpen(true);
  };

  const openEditModal = (e: React.MouseEvent, conn: any) => {
    e.preventDefault();
    setIsEditMode(true);
    setEditingId(conn.id);
    setFormData({
      name: conn.name,
      type: conn.type,
      host: conn.host,
      port: String(conn.port),
      database_name: conn.database_name,
      username: conn.username,
      password: "",
    });
    setError("");
    setTestStatus("idle");
    setIsModalOpen(true);
  };

  const handleTestInModal = async () => {
    setTestStatus("testing");
    setTestMessage("");
    try {
      const res = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const result = await res.json();
      setTestStatus(result.ok ? "ok" : "fail");
      setTestMessage(result.ok ? result.message : result.error);
    } catch (err: any) {
      setTestStatus("fail");
      setTestMessage(err.message);
    }
  };

  const handleTestSaved = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setTestingId(id);
    try {
      const res = await fetch(`/api/connections/${id}/test`, { method: "POST" });
      const result = await res.json();
      setConnections(prev =>
        prev.map(c => c.id === id ? { ...c, last_test_ok: result.ok, last_tested_at: new Date().toISOString() } : c)
      );
      if (!result.ok) alert(`Connection test failed: ${result.error}`);
    } catch (err: any) {
      alert(`Connection test failed: ${err.message}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch(isEditMode ? `/api/connections/${editingId}` : "/api/connections", {
        method: isEditMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to save");

      setIsModalOpen(false);
      setFormData(EMPTY_FORM);
      fetchConnections();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!window.confirm("Remove this connection? Its table configurations will be removed too.")) return;

    try {
      const res = await fetch(`/api/connections/${id}`, { method: "DELETE" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      fetchConnections();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="container">
      <div className="mb-8 text-center" style={{ marginTop: "4rem" }}>
        <h1 style={{ fontSize: "3rem", background: "linear-gradient(to right, #60a5fa, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Database Explorer
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", maxWidth: "600px", margin: "1rem auto" }}>
          Pick a connection to browse, edit, and manage its tables.
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "2rem" }}>
        {can("dbx.connections", "EDIT") && (
          <button className="btn btn-primary" onClick={openAddModal}>
            <Plus size={18} /> Add Connection
          </button>
        )}
      </div>

      {listError ? (
        <div className="empty-state">{listError}</div>
      ) : loading ? (
        <div className="empty-state">Loading connections...</div>
      ) : (
        <div className="grid-cards">
          {connections.map(conn => (
            <Link href={`/${conn.id}`} key={conn.id}>
              <div className="glass-card" style={{ height: "100%", display: "flex", flexDirection: "column", cursor: "pointer", position: "relative" }}>
                <div style={{ position: "absolute", top: "1rem", right: "1rem", display: "flex", gap: "0.4rem" }}>
                  {canEditConnections && (<>
                  <button
                    onClick={(e) => handleTestSaved(e, conn.id)}
                    className="btn-icon"
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
                    title="Test connection"
                    disabled={testingId === conn.id}
                  >
                    {testingId === conn.id ? <Loader2 size={16} className="spin" /> : <Server size={16} />}
                  </button>
                  <button
                    onClick={(e) => openEditModal(e, conn)}
                    className="btn-icon"
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--accent-color)", opacity: 0.6 }}
                    title="Edit Connection"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, conn.id)}
                    className="btn-icon"
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--danger-color)", opacity: 0.5 }}
                    title="Delete Connection"
                  >
                    <Trash2 size={18} />
                  </button>
                  </>)}
                </div>

                <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <Database size={32} style={{ color: "#60a5fa" }} />
                </div>

                <h3 style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>{conn.name}</h3>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{
                    fontSize: "0.7rem", fontWeight: 600, padding: "0.1rem 0.5rem", borderRadius: "999px",
                    background: conn.type === "trino" ? "rgba(192,132,252,0.15)" : "rgba(96,165,250,0.15)",
                    color: conn.type === "trino" ? "#c084fc" : "#60a5fa", textTransform: "uppercase",
                  }}>
                    {conn.type}
                  </span>
                  {conn.last_test_ok === true && <CheckCircle2 size={14} style={{ color: "#4ade80" }} />}
                  {conn.last_test_ok === false && <XCircle size={14} style={{ color: "#f87171" }} />}
                </div>

                <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", flexGrow: 1, fontFamily: "monospace" }}>
                  {conn.host}:{conn.port} / {conn.database_name}
                </p>

                <div style={{ marginTop: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--accent-color)" }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Browse Tables</span>
                  <span>→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{isEditMode ? "Edit Connection" : "Add Connection"}</h2>
              <button className="btn btn-icon btn-outline" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div style={{ color: "var(--danger-color)", marginBottom: "1rem" }}>{error}</div>}

                <div className="input-group">
                  <label className="input-label">Database Type</label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      className={`btn ${formData.type === "postgres" ? "btn-primary" : "btn-outline"}`}
                      onClick={() => setFormData({ ...formData, type: "postgres", port: formData.port || "5432" })}
                      style={{ flex: 1, justifyContent: "center" }}
                    >
                      PostgreSQL
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled
                      title="Trino support is coming in a future pass"
                      style={{ flex: 1, justifyContent: "center", opacity: 0.4, cursor: "not-allowed" }}
                    >
                      Trino (soon)
                    </button>
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label">Connection Name</label>
                  <input required className="input-field" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Production, UAE, Staging" />
                </div>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <div className="input-group" style={{ flex: 3 }}>
                    <label className="input-label">Host</label>
                    <input required className="input-field" value={formData.host} onChange={e => setFormData({ ...formData, host: e.target.value })} />
                  </div>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label className="input-label">Port</label>
                    <input required className="input-field" value={formData.port} onChange={e => setFormData({ ...formData, port: e.target.value })} />
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label">Database Name</label>
                  <input required className="input-field" value={formData.database_name} onChange={e => setFormData({ ...formData, database_name: e.target.value })} />
                </div>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label className="input-label">Username</label>
                    <input required className="input-field" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} />
                  </div>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label className="input-label">Password {isEditMode && "(leave blank to keep current)"}</label>
                    <input type="password" className="input-field" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem" }}>
                  <button type="button" className="btn btn-outline" onClick={handleTestInModal} disabled={testStatus === "testing"}>
                    {testStatus === "testing" ? <Loader2 size={15} className="spin" /> : <Server size={15} />} Test Connection
                  </button>
                  {testStatus === "ok" && <span style={{ color: "#4ade80", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.3rem" }}><CheckCircle2 size={15} /> {testMessage}</span>}
                  {testStatus === "fail" && <span style={{ color: "#f87171", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.3rem" }}><XCircle size={15} /> {testMessage}</span>}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : isEditMode ? "Update Connection" : "Save Connection"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

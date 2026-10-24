"use client";

import { useState, useEffect, use, useMemo, useRef } from "react";
import Link from "next/link";
// LayoutTemplate, BoxSelect, Trash2, Pencil have no lucide-animated equivalent;
// Loader2 stays static since it needs a continuous CSS spin, not a hover animation.
import { LayoutTemplate, BoxSelect, Trash2, Pencil, Loader2 } from "lucide-react";
import {
  DatabaseIcon as Database,
  SettingsIcon as Settings,
  ArrowLeftIcon as ArrowLeft,
  DownloadIcon as Download,
  CircleCheckIcon as CheckCircle2,
  XIcon as X,
  DatabaseBackupIcon as FetchIcon,
  type DatabaseBackupIconHandle as FetchIconHandle,
  TerminalIcon as Terminal,
  SearchIcon as Search,
  PlusIcon as Plus,
} from "lucide-animated";

const ICONS: Record<string, any> = {
  Database: Database,
  LayoutTemplate: LayoutTemplate,
  BoxSelect: BoxSelect,
  Settings: Settings,
};

const EMPTY_FORM = { table_id: "", schema_name: "public", display_name: "", description: "", icon: "Database", color: "#60a5fa", primary_key: "id" };

function prettifyTableName(tableId: string): string {
  return tableId
    .replace(/^v3_t_/, "")
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface FetchTableCandidate {
  schema: string;
  table: string;
}

interface FetchTableEntry {
  schema: string;
  table: string;
  columns: string[];
  primaryKey: string;
  loadingColumns: boolean;
}

function fetchKey(schema: string, table: string): string {
  return `${schema}.${table}`;
}

export default function ConnectionPage({ params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = use(params);

  const [connection, setConnection] = useState<any>(null);
  const [allConnections, setAllConnections] = useState<any[]>([]);
  // Controlled manually (not animateOnHover) so the animation starts when the
  // whole button is hovered, not just the small icon inside it.
  const fetchIconRef = useRef<FetchIconHandle>(null);
  const [dataSources, setDataSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [error, setError] = useState("");

  // Import-tables modal state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importSourceId, setImportSourceId] = useState("");
  const [importSourceTables, setImportSourceTables] = useState<any[]>([]);
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());
  const [importLoadingTables, setImportLoadingTables] = useState(false);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: string[]; skippedExisting: string[]; skippedMissing: string[] } | null>(null);

  const existingTableIds = useMemo(() => new Set(dataSources.map(ds => ds.table_id)), [dataSources]);

  // Configured-tables search
  const [searchQuery, setSearchQuery] = useState("");
  const filteredDataSources = useMemo(() => {
    if (!searchQuery.trim()) return dataSources;
    const q = searchQuery.toLowerCase();
    return dataSources.filter(ds => ds.display_name.toLowerCase().includes(q) || ds.table_id.toLowerCase().includes(q));
  }, [dataSources, searchQuery]);

  // Fetch-tables-from-database modal state
  const [isFetchOpen, setIsFetchOpen] = useState(false);
  const [fetchTables, setFetchTables] = useState<FetchTableCandidate[]>([]);
  const [fetchLoadingTables, setFetchLoadingTables] = useState(false);
  const [fetchSearch, setFetchSearch] = useState("");
  const [fetchSelected, setFetchSelected] = useState<Map<string, FetchTableEntry>>(new Map());
  const [fetchSubmitting, setFetchSubmitting] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ added: string[]; failed: { table: string; error: string }[] } | null>(null);

  const filteredFetchTables = useMemo(() => {
    if (!fetchSearch.trim()) return fetchTables;
    const q = fetchSearch.toLowerCase();
    return fetchTables.filter(t => t.table.toLowerCase().includes(q) || t.schema.toLowerCase().includes(q));
  }, [fetchTables, fetchSearch]);

  useEffect(() => {
    fetchAll();
  }, [connectionId]);

  useEffect(() => {
    if (!isModalOpen && !isImportOpen && !isFetchOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setIsModalOpen(false); setIsImportOpen(false); setIsFetchOpen(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isModalOpen, isImportOpen, isFetchOpen]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [connsRes, sourcesRes] = await Promise.all([
        fetch("/api/connections"),
        fetch(`/api/connections/${connectionId}/tables`),
      ]);
      const conns = await connsRes.json();
      const sources = await sourcesRes.json();
      setAllConnections(conns);
      setConnection(conns.find((c: any) => String(c.id) === connectionId) || null);
      setDataSources(sources);
    } catch (err) {
      console.error("Failed to load connection data", err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setIsEditMode(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setError("");
    setIsModalOpen(true);
  };

  const openEditModal = (e: React.MouseEvent, ds: any) => {
    e.preventDefault();
    setIsEditMode(true);
    setEditingId(ds.id);
    setFormData({
      table_id: ds.table_id,
      schema_name: ds.schema_name || "public",
      display_name: ds.display_name,
      description: ds.description || "",
      icon: ds.icon || "Database",
      color: ds.color || "#60a5fa",
      primary_key: ds.primary_key || "id",
    });
    setError("");
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch(`/api/connections/${connectionId}/tables`, {
        method: isEditMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditMode ? { ...formData, id: editingId } : formData),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to save");

      setIsModalOpen(false);
      setFormData(EMPTY_FORM);
      fetchAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!window.confirm("Are you sure you want to remove this table configuration?")) return;

    try {
      const res = await fetch(`/api/connections/${connectionId}/tables?id=${id}`, { method: "DELETE" });
      if (res.ok) fetchAll();
    } catch (err) {
      console.error(err);
    }
  };

  const openImportModal = () => {
    setImportSourceId("");
    setImportSourceTables([]);
    setImportSelected(new Set());
    setImportResult(null);
    setIsImportOpen(true);
  };

  const handleImportSourceChange = async (sourceId: string) => {
    setImportSourceId(sourceId);
    setImportSelected(new Set());
    setImportResult(null);
    if (!sourceId) { setImportSourceTables([]); return; }
    try {
      setImportLoadingTables(true);
      const res = await fetch(`/api/connections/${sourceId}/tables`);
      setImportSourceTables(await res.json());
    } catch (err) {
      console.error("Failed to load source tables", err);
    } finally {
      setImportLoadingTables(false);
    }
  };

  const toggleImportSelected = (tableId: string) => {
    setImportSelected(prev => {
      const next = new Set(prev);
      if (next.has(tableId)) next.delete(tableId);
      else next.add(tableId);
      return next;
    });
  };

  const handleImportSubmit = async () => {
    if (importSelected.size === 0) return;
    setImportSubmitting(true);
    setImportResult(null);
    try {
      const res = await fetch(`/api/connections/${connectionId}/tables/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceConnectionId: importSourceId, tableIds: Array.from(importSelected) }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Import failed");
      setImportResult(result);
      fetchAll();
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setImportSubmitting(false);
    }
  };

  const openFetchModal = async () => {
    setFetchSearch("");
    setFetchSelected(new Map());
    setFetchResult(null);
    setIsFetchOpen(true);
    try {
      setFetchLoadingTables(true);
      const res = await fetch(`/api/connections/${connectionId}/schema/tables`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to load tables");
      setFetchTables(result.tables);
    } catch (err: any) {
      alert(`Failed to load tables: ${err.message}`);
      setFetchTables([]);
    } finally {
      setFetchLoadingTables(false);
    }
  };

  const toggleFetchTable = async (schema: string, table: string) => {
    const key = fetchKey(schema, table);
    if (fetchSelected.has(key)) {
      setFetchSelected(prev => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      return;
    }

    setFetchSelected(prev => new Map(prev).set(key, { schema, table, columns: [], primaryKey: "", loadingColumns: true }));
    try {
      const res = await fetch(`/api/connections/${connectionId}/schema/tables/${table}?schema=${encodeURIComponent(schema)}`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to load columns");
      setFetchSelected(prev => {
        if (!prev.has(key)) return prev; // unchecked while loading
        const next = new Map(prev);
        next.set(key, {
          schema, table,
          columns: result.columns,
          primaryKey: result.detectedPrimaryKey || result.columns[0] || "",
          loadingColumns: false,
        });
        return next;
      });
    } catch (err: any) {
      alert(`Failed to load "${table}": ${err.message}`);
      setFetchSelected(prev => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const setFetchPrimaryKey = (key: string, primaryKey: string) => {
    setFetchSelected(prev => {
      const entry = prev.get(key);
      if (!entry) return prev;
      const next = new Map(prev);
      next.set(key, { ...entry, primaryKey });
      return next;
    });
  };

  const handleFetchSubmit = async () => {
    const entries = Array.from(fetchSelected.values());
    if (entries.length === 0) return;

    setFetchSubmitting(true);
    setFetchResult(null);
    const added: string[] = [];
    const failed: { table: string; error: string }[] = [];

    for (const entry of entries) {
      const label = entry.schema === "public" ? entry.table : `${entry.schema}.${entry.table}`;
      try {
        const res = await fetch(`/api/connections/${connectionId}/tables`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            table_id: entry.table,
            schema_name: entry.schema,
            display_name: prettifyTableName(entry.table),
            primary_key: entry.primaryKey,
          }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Failed to add");
        added.push(label);
      } catch (err: any) {
        failed.push({ table: label, error: err.message });
      }
    }

    setFetchResult({ added, failed });
    setFetchSelected(new Map());
    setFetchSubmitting(false);
    fetchAll();
    if (added.length > 0) {
      const res = await fetch(`/api/connections/${connectionId}/schema/tables`);
      if (res.ok) setFetchTables((await res.json()).tables);
    }
  };

  return (
    <div className="container">
      <div style={{ marginTop: "2rem", marginBottom: "2rem" }}>
        <div className="breadcrumb">
          <Link href="/"><ArrowLeft size={14} style={{ display: "inline-flex", verticalAlign: "middle" }} /> Connections</Link>
          <span>/</span>
          <span>{connection?.name || "..."}</span>
        </div>
        <h1 style={{ fontSize: "2rem" }}>{connection?.name || "Loading..."}</h1>
        {connection && (
          <p style={{ color: "var(--text-secondary)", fontFamily: "monospace", fontSize: "0.875rem" }}>
            {connection.host}:{connection.port} / {connection.database_name}
          </p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: "220px", maxWidth: "360px" }}>
          <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Search tables..."
            className="input-field"
            style={{ paddingLeft: "32px", paddingRight: searchQuery ? "32px" : "12px", width: "100%" }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", display: "flex", padding: "2px" }}>
              <X size={14} />
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <Link href={`/${connectionId}/console`} className="btn btn-outline">
          <Terminal size={16} /> Query Console
        </Link>

        <button
          className="btn btn-outline"
          onClick={openFetchModal}
          onMouseEnter={() => fetchIconRef.current?.startAnimation()}
          onMouseLeave={() => fetchIconRef.current?.stopAnimation()}
        >
          <FetchIcon ref={fetchIconRef} size={16} /> Fetch Tables from Database
        </button>
        <button className="btn btn-outline" onClick={openImportModal} disabled={allConnections.length < 2}>
          <Download size={18} /> Import Tables
        </button>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={18} /> Add Table Config
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Loading configurations...</div>
      ) : dataSources.length === 0 ? (
        <div className="empty-state">No tables configured yet for this connection. Add one, fetch from the database, or import from another connection, to get started.</div>
      ) : filteredDataSources.length === 0 ? (
        <div className="empty-state">No tables match "{searchQuery}".</div>
      ) : (
        <div className="grid-cards">
          {filteredDataSources.map(ds => {
            const IconComponent = ICONS[ds.icon] || Database;
            return (
              <Link href={`/${connectionId}/${ds.table_id}`} key={ds.id}>
                <div className="glass-card" style={{ height: "100%", display: "flex", flexDirection: "column", cursor: "pointer", position: "relative" }}>
                  <div style={{ position: "absolute", top: "1rem", right: "1rem", display: "flex", gap: "0.4rem" }}>
                    <button
                      onClick={(e) => openEditModal(e, ds)}
                      className="btn-icon"
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--accent-color)", opacity: 0.6 }}
                      title="Edit Table Config"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, ds.id)}
                      className="btn-icon"
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--danger-color)", opacity: 0.5 }}
                      title="Delete Table Config"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div style={{ marginBottom: "1rem" }}>
                    <IconComponent size={32} style={{ color: ds.color }} />
                  </div>
                  <h3 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>{ds.display_name}</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", flexGrow: 1 }}>{ds.description}</p>
                  <div style={{ marginTop: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--accent-color)" }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Manage Table</span>
                    <span>→</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{isEditMode ? "Edit Table Configuration" : "Add Table Configuration"}</h2>
              <button className="btn btn-icon btn-outline" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div style={{ color: "var(--danger-color)", marginBottom: "1rem" }}>{error}</div>}

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <div className="input-group" style={{ flex: 2 }}>
                    <label className="input-label">Table Name in Database (e.g. v3_t_new_table)</label>
                    <input
                      required
                      className="input-field"
                      value={formData.table_id}
                      onChange={e => setFormData({ ...formData, table_id: e.target.value })}
                      disabled={isEditMode}
                      style={isEditMode ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                    />
                  </div>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label className="input-label">Schema</label>
                    <input
                      required
                      className="input-field"
                      value={formData.schema_name}
                      onChange={e => setFormData({ ...formData, schema_name: e.target.value })}
                      disabled={isEditMode}
                      placeholder="public"
                      style={isEditMode ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label">Display Name (e.g. New Table)</label>
                  <input required className="input-field" value={formData.display_name} onChange={e => setFormData({ ...formData, display_name: e.target.value })} />
                </div>

                <div className="input-group">
                  <label className="input-label">Description</label>
                  <input className="input-field" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                </div>

                <div className="input-group">
                  <label className="input-label">Primary Key Column</label>
                  <input required className="input-field" value={formData.primary_key} onChange={e => setFormData({ ...formData, primary_key: e.target.value })} placeholder="id" />
                </div>

                <div className="input-group">
                  <label className="input-label">Icon Color (Hex)</label>
                  <input type="color" className="input-field" value={formData.color} onChange={e => setFormData({ ...formData, color: e.target.value })} style={{ height: "50px", padding: "0.5rem" }} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{isEditMode ? "Update Configuration" : "Save Configuration"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isImportOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Import Tables from Another Connection</h2>
              <button className="btn btn-icon btn-outline" onClick={() => setIsImportOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label className="input-label">Source Connection</label>
                <select
                  className="input-field"
                  value={importSourceId}
                  onChange={e => handleImportSourceChange(e.target.value)}
                >
                  <option value="">Select a connection…</option>
                  {allConnections.filter(c => c.id !== connectionId).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {importLoadingTables ? (
                <div style={{ padding: "1rem 0", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Loader2 size={16} className="spin" /> Loading tables…
                </div>
              ) : importSourceId && importSourceTables.length === 0 ? (
                <div style={{ padding: "1rem 0", color: "var(--text-secondary)" }}>This connection has no configured tables to import.</div>
              ) : importSourceTables.length > 0 ? (
                <div style={{ maxHeight: "280px", overflowY: "auto", border: "1px solid var(--surface-border)", borderRadius: "8px", padding: "0.5rem" }}>
                  {importSourceTables.map(t => {
                    const already = existingTableIds.has(t.table_id);
                    return (
                      <label key={t.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem", opacity: already ? 0.5 : 1, cursor: already ? "not-allowed" : "pointer" }}>
                        <input
                          type="checkbox"
                          checked={importSelected.has(t.table_id)}
                          disabled={already}
                          onChange={() => toggleImportSelected(t.table_id)}
                        />
                        <span style={{ flex: 1 }}>{t.display_name}</span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>{t.table_id}</span>
                        {t.schema_name && t.schema_name !== "public" && (
                          <span style={{
                            fontSize: "0.68rem", fontWeight: 600, padding: "0.1rem 0.4rem", borderRadius: "999px",
                            background: "rgba(192,132,252,0.15)", color: "#c084fc",
                          }}>{t.schema_name}</span>
                        )}
                        {already && <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Already added</span>}
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {importResult && (
                <div style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
                  {importResult.imported.length > 0 && (
                    <div style={{ color: "#4ade80", display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.25rem" }}>
                      <CheckCircle2 size={14} /> Imported: {importResult.imported.join(", ")}
                    </div>
                  )}
                  {importResult.skippedExisting.length > 0 && (
                    <div style={{ color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Already present: {importResult.skippedExisting.join(", ")}</div>
                  )}
                  {importResult.skippedMissing.length > 0 && (
                    <div style={{ color: "#f87171" }}>Not found in this connection's database: {importResult.skippedMissing.join(", ")}</div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setIsImportOpen(false)}>Close</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleImportSubmit}
                disabled={importSelected.size === 0 || importSubmitting}
              >
                {importSubmitting ? "Importing…" : `Import ${importSelected.size || ""}`.trim()}
              </button>
            </div>
          </div>
        </div>
      )}

      {isFetchOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Fetch Tables from Database</h2>
              <button className="btn btn-icon btn-outline" onClick={() => setIsFetchOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                Tables already found in <strong style={{ color: "var(--text-primary)" }}>{connection?.database_name}</strong> that
                aren't configured yet. Check a table to confirm its primary key before adding it.
              </p>

              <div className="input-group">
                <div style={{ position: "relative" }}>
                  <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", pointerEvents: "none" }} />
                  <input
                    type="text"
                    placeholder="Search database tables..."
                    className="input-field"
                    style={{ paddingLeft: "32px" }}
                    value={fetchSearch}
                    onChange={e => setFetchSearch(e.target.value)}
                  />
                </div>
              </div>

              {fetchLoadingTables ? (
                <div style={{ padding: "1rem 0", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Loader2 size={16} className="spin" /> Loading tables…
                </div>
              ) : fetchTables.length === 0 ? (
                <div style={{ padding: "1rem 0", color: "var(--text-secondary)" }}>Every table in this database is already configured.</div>
              ) : filteredFetchTables.length === 0 ? (
                <div style={{ padding: "1rem 0", color: "var(--text-secondary)" }}>No tables match "{fetchSearch}".</div>
              ) : (
                <div style={{ maxHeight: "360px", overflowY: "auto", border: "1px solid var(--surface-border)", borderRadius: "8px", padding: "0.5rem" }}>
                  {filteredFetchTables.map(t => {
                    const key = fetchKey(t.schema, t.table);
                    const entry = fetchSelected.get(key);
                    return (
                      <div key={key} style={{ borderBottom: "1px solid var(--surface-border)", padding: "0.5rem 0.25rem" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
                          <input type="checkbox" checked={!!entry} onChange={() => toggleFetchTable(t.schema, t.table)} />
                          <span style={{ flex: 1, fontFamily: "monospace", fontSize: "0.85rem" }}>{t.table}</span>
                          {t.schema !== "public" && (
                            <span style={{
                              fontSize: "0.68rem", fontWeight: 600, padding: "0.1rem 0.4rem", borderRadius: "999px",
                              background: "rgba(192,132,252,0.15)", color: "#c084fc",
                            }}>{t.schema}</span>
                          )}
                        </label>

                        {entry && (
                          <div style={{ marginTop: "0.5rem", marginLeft: "1.7rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            {entry.loadingColumns ? (
                              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                <Loader2 size={13} className="spin" /> Loading columns…
                              </span>
                            ) : (
                              <>
                                <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Primary key:</label>
                                <select
                                  className="input-field"
                                  style={{ width: "auto", padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}
                                  value={entry.primaryKey}
                                  onChange={e => setFetchPrimaryKey(key, e.target.value)}
                                >
                                  {entry.columns.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {fetchResult && (
                <div style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
                  {fetchResult.added.length > 0 && (
                    <div style={{ color: "#4ade80", display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.25rem" }}>
                      <CheckCircle2 size={14} /> Added: {fetchResult.added.join(", ")}
                    </div>
                  )}
                  {fetchResult.failed.length > 0 && (
                    <div style={{ color: "#f87171" }}>
                      Failed: {fetchResult.failed.map(f => `${f.table} (${f.error})`).join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setIsFetchOpen(false)}>Close</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleFetchSubmit}
                disabled={fetchSelected.size === 0 || fetchSubmitting || Array.from(fetchSelected.values()).some(e => e.loadingColumns)}
              >
                {fetchSubmitting ? "Adding…" : `Add ${fetchSelected.size || ""}`.trim()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

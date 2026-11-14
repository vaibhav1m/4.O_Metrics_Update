"use client";

import { useState, useEffect, use, useMemo, useRef } from "react";
import Link from "next/link";
// LayoutTemplate, BoxSelect, Trash2, Pencil have no lucide-animated equivalent;
// Loader2 stays static since it needs a continuous CSS spin, not a hover animation.
import { LayoutTemplate, BoxSelect, Trash2, Pencil, Loader2, Folder, FolderOpen, FolderPlus, FolderMinus, Layers, Check } from "lucide-react";
import { useMe, useCurrentUser } from "@/lib/useMe";
import { jsonFetch } from "@/lib/jsonFetch";
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

interface FolderRow {
  id: string;
  name: string;
  data_source_ids: string[];
}

// Remembered per connection so coming back from a table keeps you in the same folder.
const activeFolderKey = (connectionId: string) => `dbexplorer:active-folder:${connectionId}`;

function readActiveFolder(connectionId: string): string | null {
  try { return localStorage.getItem(activeFolderKey(connectionId)); } catch { return null; }
}

function writeActiveFolder(connectionId: string, folderId: string | null) {
  try {
    if (folderId) localStorage.setItem(activeFolderKey(connectionId), folderId);
    else localStorage.removeItem(activeFolderKey(connectionId));
  } catch { /* storage blocked — selection just won't persist */ }
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

  // Folders (per user, per connection)
  const user = useCurrentUser();
  const { can } = useMe();
  const canEditTables = can("dbx.tables", "EDIT");
  const canViewFolders = can("dbx.folders", "VIEW");
  const canEditFolders = can("dbx.folders", "EDIT");
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [activeFolderId, setActiveFolderIdState] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [folderError, setFolderError] = useState("");
  // "Add to folders" picker, opened from a table card
  const [folderPickerFor, setFolderPickerFor] = useState<any | null>(null);
  // "Add tables" picker, opened from inside a folder
  const [isAddToFolderOpen, setIsAddToFolderOpen] = useState(false);
  const [addToFolderSelected, setAddToFolderSelected] = useState<Set<string>>(new Set());
  const [addToFolderSearch, setAddToFolderSearch] = useState("");
  const [addToFolderSubmitting, setAddToFolderSubmitting] = useState(false);

  const activeFolder = folders.find(f => f.id === activeFolderId) || null;

  const foldersByDataSource = useMemo(() => {
    const map = new Map<string, FolderRow[]>();
    for (const f of folders) {
      for (const dsId of f.data_source_ids) {
        if (!map.has(dsId)) map.set(dsId, []);
        map.get(dsId)!.push(f);
      }
    }
    return map;
  }, [folders]);

  // Configured-tables search, within the active folder (or all tables)
  const [searchQuery, setSearchQuery] = useState("");
  const filteredDataSources = useMemo(() => {
    const inScope = activeFolder
      ? dataSources.filter(ds => activeFolder.data_source_ids.includes(ds.id))
      : dataSources;
    if (!searchQuery.trim()) return inScope;
    const q = searchQuery.toLowerCase();
    return inScope.filter(ds => ds.display_name.toLowerCase().includes(q) || ds.table_id.toLowerCase().includes(q));
  }, [dataSources, searchQuery, activeFolder]);

  const addToFolderCandidates = useMemo(() => {
    if (!activeFolder) return [];
    const q = addToFolderSearch.trim().toLowerCase();
    return dataSources.filter(ds =>
      !activeFolder.data_source_ids.includes(ds.id) &&
      (!q || ds.display_name.toLowerCase().includes(q) || ds.table_id.toLowerCase().includes(q))
    );
  }, [dataSources, activeFolder, addToFolderSearch]);

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
    setActiveFolderIdState(readActiveFolder(connectionId));
  }, [connectionId]);

  useEffect(() => {
    fetchFolders();
  }, [connectionId, user, canViewFolders]);

  useEffect(() => {
    if (!isModalOpen && !isImportOpen && !isFetchOpen && !folderPickerFor && !isAddToFolderOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsModalOpen(false); setIsImportOpen(false); setIsFetchOpen(false);
        setFolderPickerFor(null); setIsAddToFolderOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isModalOpen, isImportOpen, isFetchOpen, folderPickerFor, isAddToFolderOpen]);

  const fetchFolders = async () => {
    if (!user || !canViewFolders) { setFolders([]); return; }
    try {
      const res = await jsonFetch(`/api/connections/${connectionId}/folders`);
      if (res.ok) setFolders(await res.json());
    } catch (err) {
      console.error("Failed to load folders", err);
    }
  };

  const selectFolder = (folderId: string | null) => {
    setActiveFolderIdState(folderId);
    writeActiveFolder(connectionId, folderId);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    setFolderError("");
    const res = await jsonFetch(`/api/connections/${connectionId}/folders`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    const result = await res.json();
    if (!res.ok) { setFolderError(result.error || "Failed to create folder"); return; }
    setNewFolderName("");
    setIsCreatingFolder(false);
    await fetchFolders();
    selectFolder(result.data.id);
  };

  const handleRenameFolder = async (e: React.FormEvent, folderId: string) => {
    e.preventDefault();
    const name = renameDraft.trim();
    if (!name) return;
    setFolderError("");
    const res = await jsonFetch(`/api/connections/${connectionId}/folders/${folderId}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
    const result = await res.json();
    if (!res.ok) { setFolderError(result.error || "Failed to rename folder"); return; }
    setRenamingFolderId(null);
    fetchFolders();
  };

  const handleDeleteFolder = async (folder: FolderRow) => {
    if (!window.confirm(`Delete folder "${folder.name}"? The tables in it stay configured — only the folder is removed.`)) return;
    const res = await jsonFetch(`/api/connections/${connectionId}/folders/${folder.id}`, { method: "DELETE" });
    if (res.ok) {
      if (activeFolderId === folder.id) selectFolder(null);
      fetchFolders();
    }
  };

  const addTablesToFolder = async (folderId: string, dataSourceIds: string[]) => {
    const res = await jsonFetch(`/api/connections/${connectionId}/folders/${folderId}/tables`, {
      method: "POST",
      body: JSON.stringify({ dataSourceIds }),
    });
    if (!res.ok) alert((await res.json()).error || "Failed to add to folder");
  };

  const removeTableFromFolder = async (folderId: string, dataSourceId: string) => {
    const res = await jsonFetch(`/api/connections/${connectionId}/folders/${folderId}/tables?dataSourceId=${dataSourceId}`,
      { method: "DELETE" }
    );
    if (!res.ok) alert((await res.json()).error || "Failed to remove from folder");
  };

  const toggleTableInFolder = async (folder: FolderRow, dataSourceId: string) => {
    if (folder.data_source_ids.includes(dataSourceId)) await removeTableFromFolder(folder.id, dataSourceId);
    else await addTablesToFolder(folder.id, [dataSourceId]);
    fetchFolders();
  };

  const openAddToFolderModal = () => {
    setAddToFolderSelected(new Set());
    setAddToFolderSearch("");
    setIsAddToFolderOpen(true);
  };

  const handleAddToFolderSubmit = async () => {
    if (!activeFolder || addToFolderSelected.size === 0) return;
    setAddToFolderSubmitting(true);
    await addTablesToFolder(activeFolder.id, Array.from(addToFolderSelected));
    setAddToFolderSubmitting(false);
    setIsAddToFolderOpen(false);
    fetchFolders();
  };

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
      if (res.ok) { fetchAll(); fetchFolders(); }
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
    <div className="container conn-page">
      <header className="page-header">
        <div style={{ minWidth: 0 }}>
          <div className="breadcrumb">
            <Link href="/"><ArrowLeft size={14} style={{ display: "inline-flex", verticalAlign: "middle" }} /> Connections</Link>
            <span>/</span>
            <span>{connection?.name || "..."}</span>
          </div>
          <div className="page-header-title">
            <h1>{connection?.name || "Loading..."}</h1>
            {connection && (
              <span className="conn-host-pill">{connection.host}:{connection.port} / {connection.database_name}</span>
            )}
          </div>
        </div>

        <div className="page-header-actions">
          {can("dbx.console", "VIEW") && (
            <Link href={`/${connectionId}/console`} className="btn btn-outline btn-sm">
              <Terminal size={15} /> Query Console
            </Link>
          )}
          {canEditTables && (<>
          <button
            className="btn btn-outline btn-sm"
            onClick={openFetchModal}
            onMouseEnter={() => fetchIconRef.current?.startAnimation()}
            onMouseLeave={() => fetchIconRef.current?.stopAnimation()}
          >
            <FetchIcon ref={fetchIconRef} size={15} /> Fetch from DB
          </button>
          <button className="btn btn-outline btn-sm" onClick={openImportModal} disabled={allConnections.length < 2}>
            <Download size={15} /> Import
          </button>
          <button className="btn btn-primary btn-sm" onClick={openAddModal}>
            <Plus size={15} /> Add Table
          </button>
          </>)}
        </div>
      </header>

      <div className="explorer-panel">
        <aside className="folder-rail">
          <button
            className={`folder-item ${!activeFolder ? "active" : ""}`}
            onClick={() => selectFolder(null)}
          >
            <Layers size={15} />
            <span className="folder-item-name">All Tables</span>
            <span className="folder-item-count">{dataSources.length}</span>
          </button>

          <div className="folder-sidebar-heading">My Folders</div>

          {!user || !canViewFolders ? (
            <p className="folder-sidebar-hint">{user ? "You do not have access to folders." : "Loading…"}</p>
          ) : (
            <>
              {folders.map(f => renamingFolderId === f.id ? (
                <form key={f.id} onSubmit={e => handleRenameFolder(e, f.id)} className="folder-inline-form">
                  <input
                    autoFocus
                    className="input-field"
                    value={renameDraft}
                    onChange={e => setRenameDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Escape") setRenamingFolderId(null); }}
                    onBlur={() => setRenamingFolderId(null)}
                  />
                </form>
              ) : (
                <div key={f.id} className={`folder-item ${activeFolderId === f.id ? "active" : ""}`} onClick={() => selectFolder(f.id)}>
                  {activeFolderId === f.id ? <FolderOpen size={15} /> : <Folder size={15} />}
                  <span className="folder-item-name" title={f.name}>{f.name}</span>
                  <span className="folder-item-count">{f.data_source_ids.length}</span>
                  {canEditFolders && <span className="folder-item-actions">
                    <button
                      className="folder-icon-btn"
                      title="Rename folder"
                      onClick={e => { e.stopPropagation(); setRenamingFolderId(f.id); setRenameDraft(f.name); setFolderError(""); }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      className="folder-icon-btn danger"
                      title="Delete folder"
                      onClick={e => { e.stopPropagation(); handleDeleteFolder(f); }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>}
                </div>
              ))}

              {!canEditFolders ? null : isCreatingFolder ? (
                <form onSubmit={handleCreateFolder} className="folder-inline-form">
                  <input
                    autoFocus
                    className="input-field"
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Escape") setIsCreatingFolder(false); }}
                    onBlur={() => { if (!newFolderName.trim()) setIsCreatingFolder(false); }}
                  />
                </form>
              ) : (
                <button
                  className="folder-new-btn"
                  onClick={() => { setIsCreatingFolder(true); setNewFolderName(""); setFolderError(""); }}
                >
                  <FolderPlus size={15} /> New folder
                </button>
              )}

              {folderError && <p className="folder-sidebar-hint" style={{ color: "var(--danger-color)" }}>{folderError}</p>}
            </>
          )}
        </aside>

        <section className="explorer-main">
          <div className="explorer-toolbar">
            <div className="explorer-title">
              {activeFolder ? <FolderOpen size={18} /> : <Layers size={18} />}
              <h2>{activeFolder ? activeFolder.name : "All Tables"}</h2>
              <span className="count-pill">{filteredDataSources.length}</span>
            </div>

            <div className="search-box">
              <Search size={14} />
              <input
                type="text"
                placeholder={activeFolder ? `Search in ${activeFolder.name}` : "Search tables"}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} title="Clear search">
                  <X size={13} />
                </button>
              )}
            </div>

            {activeFolder && canEditFolders && (
              <button className="btn btn-primary btn-sm" onClick={openAddToFolderModal} disabled={dataSources.length === 0}>
                <Plus size={15} /> Add Tables
              </button>
            )}
          </div>

          <div className="explorer-body">
          {loading ? (
            <div className="empty-block"><Loader2 size={18} className="spin" /> Loading tables…</div>
          ) : dataSources.length === 0 ? (
            <div className="empty-block">
              <span className="empty-block-icon"><Database size={20} /></span>
              <strong>No tables configured yet</strong>
              <span>Add one, fetch from the database, or import from another connection.</span>
            </div>
          ) : filteredDataSources.length === 0 ? (
            searchQuery ? (
              <div className="empty-block">
                <span className="empty-block-icon"><Search size={20} /></span>
                <strong>No matches</strong>
                <span>Nothing matches &ldquo;{searchQuery}&rdquo;{activeFolder ? ` in ${activeFolder.name}` : ""}.</span>
              </div>
            ) : (
              <div className="empty-block">
                <span className="empty-block-icon"><FolderOpen size={20} /></span>
                <strong>This folder is empty</strong>
                <span>Pick tables from this connection to group them here. A table can be in any number of folders.</span>
                {canEditFolders && (
                <button className="btn btn-outline btn-sm" onClick={openAddToFolderModal} style={{ marginTop: "0.5rem" }}>
                  <Plus size={15} /> Add Tables
                </button>)}
              </div>
            )
          ) : (
            <div className="table-cards">
              {filteredDataSources.map(ds => {
                const IconComponent = ICONS[ds.icon] || Database;
                const dsFolders = foldersByDataSource.get(ds.id) || [];
                return (
                  <Link href={`/${connectionId}/${ds.table_id}`} key={ds.id} className="table-card">
                    <div className="table-card-top">
                      <span className="table-card-icon" style={{ color: ds.color, background: `${ds.color}1f` }}>
                        <IconComponent size={20} />
                      </span>
                      <div className="table-card-actions">
                        {user && canEditFolders && (
                          <button
                            onClick={e => { e.preventDefault(); setFolderPickerFor(ds); }}
                            className="folder-icon-btn"
                            title="Add to folders"
                          >
                            <FolderPlus size={15} />
                          </button>
                        )}
                        {activeFolder && canEditFolders && (
                          <button
                            onClick={async e => { e.preventDefault(); await removeTableFromFolder(activeFolder.id, ds.id); fetchFolders(); }}
                            className="folder-icon-btn"
                            title={`Remove from ${activeFolder.name}`}
                          >
                            <FolderMinus size={15} />
                          </button>
                        )}
                        {canEditTables && (<>
                        <button onClick={e => openEditModal(e, ds)} className="folder-icon-btn" title="Edit Table Config">
                          <Pencil size={15} />
                        </button>
                        <button onClick={e => handleDelete(e, ds.id)} className="folder-icon-btn danger" title="Delete Table Config">
                          <Trash2 size={15} />
                        </button>
                        </>)}
                      </div>
                    </div>
                    <h3 className="table-card-title">{ds.display_name}</h3>
                    <div className="table-card-meta">
                      <span>{ds.table_id}</span>
                      {ds.schema_name && ds.schema_name !== "public" && <span className="schema-badge">{ds.schema_name}</span>}
                    </div>
                    {ds.description && <p className="table-card-desc">{ds.description}</p>}
                    {dsFolders.length > 0 && (
                      <div className="folder-chips">
                        {dsFolders.map(f => (
                          <span key={f.id} className="folder-chip"><Folder size={11} /> {f.name}</span>
                        ))}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
          </div>
        </section>
      </div>

      {folderPickerFor && (
        <div className="modal-overlay" onClick={() => setFolderPickerFor(null)}>
          <div className="modal-content" style={{ maxWidth: "420px" }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: "1.25rem", marginBottom: 0 }}>Folders for {folderPickerFor.display_name}</h2>
              <button className="btn btn-icon btn-outline" onClick={() => setFolderPickerFor(null)}>✕</button>
            </div>
            <div className="modal-body">
              {folders.length === 0 ? (
                <p style={{ color: "var(--text-secondary)" }}>You don&apos;t have any folders yet. Create one from the sidebar first.</p>
              ) : (
                <div className="picker-list">
                  {folders.map(f => {
                    const inFolder = f.data_source_ids.includes(folderPickerFor.id);
                    return (
                      <label key={f.id} className="picker-row">
                        <input type="checkbox" checked={inFolder} onChange={() => toggleTableInFolder(f, folderPickerFor.id)} />
                        <Folder size={15} style={{ color: "var(--text-secondary)" }} />
                        <span style={{ flex: 1 }}>{f.name}</span>
                        {inFolder && <Check size={14} style={{ color: "var(--success-color)" }} />}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={() => setFolderPickerFor(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {isAddToFolderOpen && activeFolder && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 style={{ marginBottom: 0 }}>Add Tables to {activeFolder.name}</h2>
              <button className="btn btn-icon btn-outline" onClick={() => setIsAddToFolderOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <div style={{ position: "relative" }}>
                  <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", pointerEvents: "none" }} />
                  <input
                    type="text"
                    placeholder="Search configured tables..."
                    className="input-field"
                    style={{ paddingLeft: "32px" }}
                    value={addToFolderSearch}
                    onChange={e => setAddToFolderSearch(e.target.value)}
                  />
                </div>
              </div>
              {addToFolderCandidates.length === 0 ? (
                <p style={{ color: "var(--text-secondary)", padding: "1rem 0" }}>
                  {addToFolderSearch ? `No tables match "${addToFolderSearch}".` : "Every configured table is already in this folder."}
                </p>
              ) : (
                <div className="picker-list" style={{ maxHeight: "360px" }}>
                  {addToFolderCandidates.map(ds => (
                    <label key={ds.id} className="picker-row">
                      <input
                        type="checkbox"
                        checked={addToFolderSelected.has(ds.id)}
                        onChange={() => setAddToFolderSelected(prev => {
                          const next = new Set(prev);
                          if (next.has(ds.id)) next.delete(ds.id); else next.add(ds.id);
                          return next;
                        })}
                      />
                      <span style={{ flex: 1 }}>{ds.display_name}</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>{ds.table_id}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setIsAddToFolderOpen(false)}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleAddToFolderSubmit}
                disabled={addToFolderSelected.size === 0 || addToFolderSubmitting}
              >
                {addToFolderSubmitting ? "Adding…" : `Add ${addToFolderSelected.size || ""}`.trim()}
              </button>
            </div>
          </div>
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

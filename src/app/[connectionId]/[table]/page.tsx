"use client";

import { useState, useEffect, use, useMemo, useRef } from "react";
// PlusCircle, FilterX, Trash2 have no lucide-animated equivalent; Loader2 stays
// static since it needs a continuous CSS spin, not a hover animation.
import { PlusCircle, FilterX, Trash2, Loader2 } from "lucide-react";
import {
  ArrowLeftIcon as ArrowLeft,
  ChevronLeftIcon as ChevronLeft,
  ChevronRightIcon as ChevronRight,
  SearchIcon as Search,
  XIcon as X,
  DownloadIcon as Download,
  CircleCheckIcon as CheckCircle2,
  PlusIcon as Plus,
  EyeIcon as Eye,
} from "lucide-animated";
import Link from "next/link";
import DynamicTable, { type DynamicTableHandle, type ColumnFilterModel } from "@/components/DynamicTable";
import EditModal from "@/components/EditModal";

const PAGE_SIZE = 200;

interface ImportFilterRow {
  id: number;
  column: string;
  allValues: string[];
  loadingValues: boolean;
  selectedValues: Set<string>;
}

export default function TablePage({ params }: { params: Promise<{ connectionId: string; table: string }> }) {
  const { connectionId, table } = use(params);
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentRow, setCurrentRow] = useState<any>(null);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchCol, setSearchCol] = useState("__all__");
  const tableRef = useRef<DynamicTableHandle>(null);

  // Column filters (the grid's per-column checkbox filters) are applied
  // server-side so totals/pagination stay correct. Kept in a ref (read
  // synchronously by fetchData, avoiding stale-closure issues) alongside
  // state (so the UI — e.g. the Clear Filters button — can react to it).
  const columnFiltersRef = useRef<ColumnFilterModel | null>(null);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const filterFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filtersRefreshing, setFiltersRefreshing] = useState(false);

  const [primaryKey, setPrimaryKey] = useState('id');
  const [schemaName, setSchemaName] = useState('public');
  const [connection, setConnection] = useState<any>(null);
  const [allConnections, setAllConnections] = useState<any[]>([]);

  // Import-data modal state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importSrcConnId, setImportSrcConnId] = useState("");
  const [importSrcTables, setImportSrcTables] = useState<any[]>([]);
  const [importSrcTableId, setImportSrcTableId] = useState("");
  const [importSrcColumns, setImportSrcColumns] = useState<string[]>([]);
  const [importLoadingTables, setImportLoadingTables] = useState(false);
  const [importLoadingColumns, setImportLoadingColumns] = useState(false);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<{ sourceTotal: number; imported: number; skippedExisting: number } | null>(null);
  const [importFilters, setImportFilters] = useState<ImportFilterRow[]>([]);
  const filterIdSeq = useRef(0);

  // Preview sub-modal state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewData, setPreviewData] = useState<{
    sourceTotal: number; willImport: number; alreadyExists: number; columns: string[]; page: number; limit: number; rows: any[];
  } | null>(null);

  const apiBase = `/api/connections/${connectionId}/tables/${table}`;

  const formattedTableName = table
    .replace('v3_t_', '')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const totalPages = Math.ceil(total / PAGE_SIZE);

  useEffect(() => {
    // Switching tables/connections must not carry filters over from whatever
    // was previously applied — they're a ref, so they'd otherwise leak.
    columnFiltersRef.current = null;
    setHasActiveFilters(false);
    tableRef.current?.clearFilters();
    setPage(1);
    fetchData(1);
  }, [connectionId, table]);

  // Page navigation fetches explicitly (rather than via a [page] effect) so it
  // can't race with the debounced, non-page-state-driven filter refetch below.
  const goToPage = (newPage: number) => {
    setPage(newPage);
    fetchData(newPage);
  };

  useEffect(() => {
    fetch("/api/connections")
      .then(r => r.json())
      .then(list => {
        setAllConnections(list);
        setConnection(list.find((c: any) => String(c.id) === connectionId) || null);
      })
      .catch(() => {});
  }, [connectionId]);

  useEffect(() => {
    if (!isImportOpen && !isPreviewOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isPreviewOpen) setIsPreviewOpen(false);
      else setIsImportOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isImportOpen, isPreviewOpen]);

  const fetchData = async (pg: number, options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? true;
    try {
      if (showLoading) setLoading(true);
      else setFiltersRefreshing(true);

      const filters = columnFiltersRef.current;
      const filterParam = filters
        ? `&filters=${encodeURIComponent(JSON.stringify(Object.entries(filters).map(([column, m]) => ({ column, values: m.values }))))}`
        : "";
      const res = await fetch(`${apiBase}?page=${pg}&limit=${PAGE_SIZE}${filterParam}`);
      const result = await res.json();
      if (result.error) { showToast(`Error: ${result.error}`); return; }
      let newColumns = result.columns || [];
      if (result.hasPlatformId && !newColumns.includes('platform_name')) {
        newColumns = [...newColumns, 'platform_name'];
      }
      setColumns(prev =>
        prev.length === newColumns.length && prev.every((c, i) => c === newColumns[i])
          ? prev
          : newColumns
      );
      setData(result.data || []);
      setTotal(result.total ?? 0);
      setPrimaryKey(result.primaryKey || 'id');
      setSchemaName(result.schemaName || 'public');
    } catch (err) {
      console.error("Failed to fetch", err);
    } finally {
      if (showLoading) setLoading(false);
      else setFiltersRefreshing(false);
    }
  };

  // Triggered by the grid's per-column checkbox filters. Debounced since each
  // checkbox click fires this — without it, rapid toggling would spam the API.
  // Keeps the grid mounted throughout (showLoading: false) so the filter
  // dropdown the user is actively using doesn't get yanked out from under them.
  const handleColumnFiltersChanged = (model: ColumnFilterModel | null) => {
    columnFiltersRef.current = model;
    setHasActiveFilters(!!model);

    if (filterFetchTimer.current) clearTimeout(filterFetchTimer.current);
    filterFetchTimer.current = setTimeout(() => {
      setPage(1);
      fetchData(1, { showLoading: false });
    }, 300);
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleEdit = (row: any) => { setCurrentRow(row); setIsNewRecord(false); setIsModalOpen(true); };

  const handleCreateNew = () => {
    const defaultData: any = {};
    columns.forEach(col => { if (col !== 'platform_name') defaultData[col] = ""; });
    setCurrentRow(defaultData);
    setIsNewRecord(true);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    try {
      const res = await fetch(`${apiBase}?id=${id}`, { method: "DELETE" });
      if (res.ok) { showToast("Record deleted successfully"); fetchData(page); }
      else { const err = await res.json(); alert(`Error: ${err.error}`); }
    } catch (err) { console.error("Failed to delete", err); }
  };

  const handleSave = async (updatedData: any) => {
    try {
      const isCreate = isNewRecord;
      const res = await fetch(apiBase, {
        method: isCreate ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedData),
      });
      const result = await res.json();
      if (res.ok) {
        setIsModalOpen(false);
        fetchData(isCreate ? 1 : page);
        if (isCreate) setPage(1);
        showToast(`Record ${isCreate ? 'created' : 'updated'} successfully`);
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) { console.error("Failed to save", err); }
  };

  const closeImportModal = () => {
    setIsImportOpen(false);
    setIsPreviewOpen(false);
  };

  const openImportModal = () => {
    setImportSrcConnId("");
    setImportSrcTables([]);
    setImportSrcTableId("");
    setImportSrcColumns([]);
    setImportFilters([]);
    setImportResult(null);
    setPreviewData(null);
    setPreviewPage(1);
    setIsPreviewOpen(false);
    setIsImportOpen(true);
  };

  const handleImportConnChange = async (sourceId: string) => {
    setImportSrcConnId(sourceId);
    setImportSrcTableId("");
    setImportSrcColumns([]);
    setImportFilters([]);
    setImportResult(null);
    if (!sourceId) { setImportSrcTables([]); return; }
    try {
      setImportLoadingTables(true);
      const res = await fetch(`/api/connections/${sourceId}/tables`);
      setImportSrcTables(await res.json());
    } catch (err) {
      console.error("Failed to load source tables", err);
    } finally {
      setImportLoadingTables(false);
    }
  };

  const handleImportTableChange = async (sourceTableId: string) => {
    setImportSrcTableId(sourceTableId);
    setImportFilters([]);
    setImportResult(null);
    setImportSrcColumns([]);
    if (!sourceTableId) return;
    try {
      setImportLoadingColumns(true);
      const res = await fetch(`/api/connections/${importSrcConnId}/tables/${sourceTableId}?page=1&limit=1`);
      const result = await res.json();
      setImportSrcColumns(result.columns || []);
    } catch (err) {
      console.error("Failed to load source columns", err);
    } finally {
      setImportLoadingColumns(false);
    }
  };

  const addFilterRow = () => {
    setImportFilters(prev => [...prev, { id: ++filterIdSeq.current, column: "", allValues: [], loadingValues: false, selectedValues: new Set() }]);
  };

  const removeFilterRow = (id: number) => {
    setImportFilters(prev => prev.filter(f => f.id !== id));
  };

  const handleFilterColumnChange = async (id: number, column: string) => {
    setImportFilters(prev => prev.map(f => f.id === id ? { ...f, column, allValues: [], selectedValues: new Set(), loadingValues: !!column } : f));
    if (!column) return;
    try {
      const res = await fetch(`/api/connections/${importSrcConnId}/tables/${importSrcTableId}/distinct?column=${column}`);
      const result = await res.json();
      setImportFilters(prev => prev.map(f => f.id === id ? { ...f, allValues: result.values || [], loadingValues: false } : f));
    } catch (err) {
      console.error("Failed to load filter values", err);
      setImportFilters(prev => prev.map(f => f.id === id ? { ...f, loadingValues: false } : f));
    }
  };

  const toggleFilterValue = (id: number, value: string) => {
    setImportFilters(prev => prev.map(f => {
      if (f.id !== id) return f;
      const next = new Set(f.selectedValues);
      if (next.has(value)) next.delete(value); else next.add(value);
      return { ...f, selectedValues: next };
    }));
  };

  const buildFilterPayload = () =>
    importFilters
      .filter(f => f.column && f.selectedValues.size > 0)
      .map(f => ({ column: f.column, values: Array.from(f.selectedValues) }));

  const handleImportSubmit = async () => {
    if (!importSrcConnId || !importSrcTableId) return;
    setImportSubmitting(true);
    setImportResult(null);
    try {
      const res = await fetch(`${apiBase}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceConnectionId: importSrcConnId, sourceTableId: importSrcTableId, filters: buildFilterPayload() }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Import failed");
      setImportResult(result);
      fetchData(page);
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setImportSubmitting(false);
    }
  };

  const fetchPreviewPage = async (targetPage: number) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`${apiBase}/import/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceConnectionId: importSrcConnId, sourceTableId: importSrcTableId, filters: buildFilterPayload(), page: targetPage }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Preview failed");
      setPreviewData(result);
      setPreviewPage(targetPage);
    } catch (err: any) {
      alert(`Preview failed: ${err.message}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleShowPreview = () => {
    setIsPreviewOpen(true);
    fetchPreviewPage(1);
  };

  const handleSearch = () => setSearchTerm(searchInput);
  const handleClear = () => { setSearchInput(""); setSearchTerm(""); setSearchCol("__all__"); };

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const s = searchTerm.toLowerCase();
    return data.filter(row => {
      const cols = searchCol === "__all__" ? columns : [searchCol];
      return cols.some(col => {
        const val = row[col];
        if (val === null || val === undefined) return false;
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        return str.toLowerCase().includes(s);
      });
    });
  }, [data, searchTerm, searchCol, columns]);

  const startRow = (page - 1) * PAGE_SIZE + 1;
  const endRow = Math.min(page * PAGE_SIZE, total);

  const getPageNumbers = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  return (
    <div className="container-wide">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <Link href={`/${connectionId}`} className="btn btn-icon btn-outline"><ArrowLeft size={20} /></Link>
        <div>
          <div className="breadcrumb">
            <Link href="/">Connections</Link>
            <span>/</span>
            <Link href={`/${connectionId}`}>{connection?.name ?? "…"}</Link>
            <span>/</span>
            <span style={{ color: "var(--text-primary)" }}>{table}</span>
          </div>
          <h1 style={{ marginBottom: "0.1rem", display: "flex", alignItems: "center", gap: "0.6rem" }}>
            {formattedTableName} Table
            {schemaName !== "public" && (
              <span style={{
                fontSize: "0.7rem", fontWeight: 600, padding: "0.15rem 0.55rem", borderRadius: "999px",
                background: "rgba(192,132,252,0.15)", color: "#c084fc", verticalAlign: "middle",
              }}>{schemaName}</span>
            )}
          </h1>
          {connection && (
            <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "0.8rem", fontFamily: "monospace" }}>
              {connection.host}:{connection.port} / {connection.database_name}
            </p>
          )}
        </div>
      </div>

      {/* Toolbar: search + add button */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {/* Column selector */}
        <select
          value={searchCol}
          onChange={e => setSearchCol(e.target.value)}
          className="input-field"
          style={{ width: "auto", minWidth: "160px", cursor: "pointer" }}
        >
          <option value="__all__">All Columns</option>
          {columns.map(col => (
            <option key={col} value={col}>{col.replace(/_/g, " ")}</option>
          ))}
        </select>

        {/* Search input */}
        <div style={{ position: "relative", flex: 1, minWidth: "200px", maxWidth: "400px" }}>
          <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Search records..."
            className="input-field"
            style={{ paddingLeft: "32px", paddingRight: searchInput ? "32px" : "12px", width: "100%" }}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
          />
          {searchInput && (
            <button onClick={handleClear} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", display: "flex", padding: "2px" }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Search button */}
        <button onClick={handleSearch} className="btn btn-outline" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Search size={15} /> Search
        </button>

        {/* Clear column filters */}
        <button
          onClick={() => tableRef.current?.clearFilters()}
          className="btn btn-outline"
          title="Clear all column filters"
          disabled={!hasActiveFilters}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            borderColor: hasActiveFilters ? "rgba(239,68,68,0.4)" : "var(--surface-border)",
            color: hasActiveFilters ? "#f87171" : "var(--text-secondary)",
            opacity: hasActiveFilters ? 1 : 0.45,
            cursor: hasActiveFilters ? "pointer" : "not-allowed",
          }}
        >
          <FilterX size={15} /> Clear Filters
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Import data from another connection */}
        <button onClick={openImportModal} className="btn btn-outline">
          <Download size={18} /> Import Data
        </button>

        {/* Add entry */}
        <button onClick={handleCreateNew} className="btn btn-primary" disabled={columns.length === 0}>
          <PlusCircle size={18} /> Add New Entry
        </button>
      </div>

      {/* Row count info */}
      {!loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginBottom: "0.6rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
          <span>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{filteredData.length}</span>
            {searchTerm ? ` matching rows` : ` rows loaded`}
            {searchTerm && <span> (filtered from <strong style={{ color: "#e2e8f0" }}>{data.length}</strong> loaded)</span>}
          </span>
          <span style={{ color: "rgba(255,255,255,0.15)" }}>|</span>
          <span>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{total.toLocaleString()}</span>
            {hasActiveFilters ? " matching records" : " total records in database"}
            {totalPages > 1 && <span> — page {page} of {totalPages} ({startRow}–{endRow} loaded)</span>}
          </span>
          {filtersRefreshing && (
            <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--accent-color)" }}>
              <Loader2 size={13} className="spin" /> Updating…
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div style={{ padding: "0" }}>
        {loading ? (
          <div className="empty-state">Loading data...</div>
        ) : (
          <DynamicTable
            ref={tableRef}
            data={filteredData}
            schemaColumns={columns}
            primaryKey={primaryKey}
            tableName={table}
            connectionId={connectionId}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onFilterChanged={handleColumnFiltersChanged}
          />
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          <span>Showing {startRow}–{endRow} of {total} records</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <button className="btn btn-outline btn-icon" onClick={() => goToPage(page - 1)} disabled={page === 1} style={{ padding: '0.4rem 0.6rem' }}>
              <ChevronLeft size={16} />
            </button>
            {getPageNumbers().map((p, i) =>
              p === '...' ? (
                <span key={`e-${i}`} style={{ padding: '0 0.5rem' }}>…</span>
              ) : (
                <button key={p} className={`btn ${p === page ? 'btn-primary' : 'btn-outline'}`} onClick={() => goToPage(p as number)} style={{ padding: '0.4rem 0.75rem', minWidth: '2.25rem' }}>
                  {p}
                </button>
              )
            )}
            <button className="btn btn-outline btn-icon" onClick={() => goToPage(page + 1)} disabled={page === totalPages} style={{ padding: '0.4rem 0.6rem' }}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      <EditModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} rowData={currentRow} primaryKey={primaryKey} isNew={isNewRecord} />
      {toastMessage && <div className="toast">{toastMessage}</div>}

      {isImportOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Import Data from Another Table</h2>
              <button className="btn btn-icon btn-outline" onClick={closeImportModal}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                Rows are copied into <strong style={{ color: "var(--text-primary)" }}>{table}</strong> on this connection.
                Existing rows (matched by primary key) are left untouched — only new rows are added.
              </p>

              <div className="input-group">
                <label className="input-label">Source Connection</label>
                <select className="input-field" value={importSrcConnId} onChange={e => handleImportConnChange(e.target.value)}>
                  <option value="">Select a connection…</option>
                  {allConnections.filter(c => c.id !== connectionId).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {importLoadingTables ? (
                <div style={{ padding: "0.5rem 0", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Loader2 size={16} className="spin" /> Loading tables…
                </div>
              ) : importSrcConnId && (
                <div className="input-group">
                  <label className="input-label">Source Table</label>
                  <select className="input-field" value={importSrcTableId} onChange={e => handleImportTableChange(e.target.value)}>
                    <option value="">Select a table…</option>
                    {importSrcTables.map(t => (
                      <option key={t.id} value={t.table_id}>{t.display_name} ({t.table_id})</option>
                    ))}
                  </select>
                </div>
              )}

              {importLoadingColumns && (
                <div style={{ padding: "0.5rem 0", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Loader2 size={16} className="spin" /> Loading columns…
                </div>
              )}

              {importSrcTableId && !importLoadingColumns && (
                <div style={{ marginTop: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <label className="input-label" style={{ margin: 0 }}>Filters (optional)</label>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}
                      onClick={addFilterRow}
                      disabled={importFilters.length >= importSrcColumns.length}
                    >
                      <Plus size={14} /> Add Filter
                    </button>
                  </div>

                  {importFilters.length === 0 ? (
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>No filters — every row will be considered.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {importFilters.map(f => (
                        <div key={f.id} style={{ border: "1px solid var(--surface-border)", borderRadius: "8px", padding: "0.75rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                            <select
                              className="input-field"
                              style={{ flex: 1 }}
                              value={f.column}
                              onChange={e => handleFilterColumnChange(f.id, e.target.value)}
                            >
                              <option value="">Select a column…</option>
                              {importSrcColumns
                                .filter(c => c === f.column || !importFilters.some(other => other.id !== f.id && other.column === c))
                                .map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <button type="button" className="btn btn-icon btn-outline" onClick={() => removeFilterRow(f.id)} title="Remove filter">
                              <Trash2 size={14} />
                            </button>
                          </div>

                          {f.loadingValues ? (
                            <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                              <Loader2 size={14} className="spin" /> Loading values…
                            </div>
                          ) : f.column && (
                            <div style={{ maxHeight: "160px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}>
                              {f.allValues.length === 0 ? (
                                <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>No values found.</span>
                              ) : f.allValues.map(v => (
                                <label key={v} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.2rem 0.3rem", fontSize: "0.85rem", cursor: "pointer" }}>
                                  <input type="checkbox" checked={f.selectedValues.has(v)} onChange={() => toggleFilterValue(f.id, v)} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
                                </label>
                              ))}
                            </div>
                          )}

                          {f.column && f.selectedValues.size > 0 && (
                            <div style={{ marginTop: "0.4rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                              {f.selectedValues.size} value{f.selectedValues.size === 1 ? "" : "s"} selected
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {importSrcTableId && !importLoadingColumns && (
                <div style={{ marginTop: "0.75rem" }}>
                  <button type="button" className="btn btn-outline" onClick={handleShowPreview} disabled={previewLoading}>
                    {previewLoading ? <Loader2 size={15} className="spin" /> : <Eye size={15} />} Show Preview
                  </button>
                </div>
              )}

              {importResult && (
                <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "#4ade80", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <CheckCircle2 size={14} />
                  Imported {importResult.imported} of {importResult.sourceTotal} rows ({importResult.skippedExisting} already existed).
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={closeImportModal}>Close</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleImportSubmit}
                disabled={!importSrcConnId || !importSrcTableId || importSubmitting}
              >
                {importSubmitting ? "Importing…" : "Import Rows"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isPreviewOpen && (
        <div className="modal-overlay" style={{ zIndex: 60 }}>
          <div className="modal-content" style={{ maxWidth: "900px" }}>
            <div className="modal-header">
              <h2>Preview Import</h2>
              <button className="btn btn-icon btn-outline" onClick={() => setIsPreviewOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              {previewLoading && !previewData ? (
                <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--text-secondary)" }}>
                  <Loader2 size={20} className="spin" /> Loading preview…
                </div>
              ) : previewData && (
                <>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                    <strong style={{ color: "var(--text-primary)" }}>{previewData.willImport}</strong> row{previewData.willImport === 1 ? "" : "s"} will be imported
                    {previewData.alreadyExists > 0 && <> ({previewData.alreadyExists} already exist and will be skipped)</>}.
                    {previewData.willImport > 0 && (
                      <> Showing {(previewData.page - 1) * previewData.limit + 1}–{Math.min(previewData.page * previewData.limit, previewData.willImport)} of {previewData.willImport}.</>
                    )}
                  </p>

                  {previewData.willImport === 0 ? (
                    <div className="empty-state" style={{ padding: "2rem" }}>No new rows match this selection.</div>
                  ) : (
                    <div className="table-container" style={{ maxHeight: "50vh", overflow: "auto" }}>
                      <table>
                        <thead>
                          <tr>
                            {previewData.columns.map(col => <th key={col}>{col.replace(/_/g, " ")}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.rows.map((row, i) => (
                            <tr key={i}>
                              {previewData.columns.map(col => {
                                const val = row[col];
                                const text = val === null || val === undefined ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
                                return <td key={col} title={text} style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</td>;
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: "space-between" }}>
              {previewData && previewData.willImport > previewData.limit ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <button
                    className="btn btn-outline btn-icon"
                    onClick={() => fetchPreviewPage(previewPage - 1)}
                    disabled={previewPage === 1 || previewLoading}
                    style={{ padding: "0.4rem 0.6rem" }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", padding: "0 0.5rem" }}>
                    Page {previewPage} of {Math.ceil(previewData.willImport / previewData.limit)}
                  </span>
                  <button
                    className="btn btn-outline btn-icon"
                    onClick={() => fetchPreviewPage(previewPage + 1)}
                    disabled={previewPage >= Math.ceil(previewData.willImport / previewData.limit) || previewLoading}
                    style={{ padding: "0.4rem 0.6rem" }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              ) : <span />}
              <button type="button" className="btn btn-outline" onClick={() => setIsPreviewOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

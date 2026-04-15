"use client";

import { useState, useEffect, use } from "react";
import { ArrowLeft, PlusCircle, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import DynamicTable from "@/components/DynamicTable";
import EditModal from "@/components/EditModal";

const PAGE_SIZE = 200;

export default function TablePage({ params }: { params: Promise<{ table: string }> }) {
  const { table } = use(params);
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

  const primaryKey = table === 'v3_t_master_modules' ? 'module_id' : 'id';

  const formattedTableName = table
    .replace('v3_t_', '')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const totalPages = Math.ceil(total / PAGE_SIZE);

  useEffect(() => {
    fetchData(1);
  }, [table]);

  useEffect(() => {
    fetchData(page);
  }, [page]);

  const fetchData = async (pg: number) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tables/${table}?page=${pg}&limit=${PAGE_SIZE}`);
      const result = await res.json();
      if (result.error) { showToast(`Error: ${result.error}`); return; }
      let newColumns = result.columns || [];
      if (result.hasPlatformId && !newColumns.includes('platform_name')) {
        newColumns = [...newColumns, 'platform_name'];
      }
      setColumns(newColumns);
      setData(result.data || []);
      setTotal(result.total ?? 0);
    } catch (err) {
      console.error("Failed to fetch", err);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleEdit = (row: any) => {
    setCurrentRow(row);
    setIsNewRecord(false);
    setIsModalOpen(true);
  };

  const handleCreateNew = () => {
    const defaultData: any = {};
    columns.forEach(col => {
      if (col !== 'platform_name') defaultData[col] = "";
    });
    setCurrentRow(defaultData);
    setIsNewRecord(true);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    try {
      const res = await fetch(`/api/tables/${table}?id=${id}`, { method: "DELETE" });
      if (res.ok) { showToast("Record deleted successfully"); fetchData(page); }
      else { const err = await res.json(); alert(`Error: ${err.error}`); }
    } catch (err) { console.error("Failed to delete", err); }
  };

  const handleSave = async (updatedData: any) => {
    try {
      const isCreate = isNewRecord;
      const res = await fetch(`/api/tables/${table}`, {
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
    <div className="container">
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
        <Link href="/" className="btn btn-icon btn-outline"><ArrowLeft size={20} /></Link>
        <div>
          <h1>{formattedTableName} Table</h1>
          <p style={{ color: "var(--text-secondary)" }}>Manage data entries dynamically.</p>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="Search records..."
          className="input-field"
          style={{ maxWidth: "300px" }}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
        <button onClick={handleCreateNew} className="btn btn-primary" disabled={columns.length === 0}>
          <PlusCircle size={18} /> Add New Entry
        </button>
      </div>

      <div className="glass-card" style={{ padding: "0", background: "transparent", border: "none", boxShadow: "none" }}>
        {loading ? (
          <div className="empty-state">Loading data...</div>
        ) : (
          <DynamicTable data={data.filter(row => {
            if (!searchTerm) return true;
            const s = searchTerm.toLowerCase();
            return columns.some(col => {
              const val = row[col];
              if (val === null || val === undefined) return false;
              const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
              return str.toLowerCase().includes(s);
            });
          })} schemaColumns={columns} primaryKey={primaryKey} onEdit={handleEdit} onDelete={handleDelete} />
        )}
      </div>

      {!loading && totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          <span>Showing {startRow}–{endRow} of {total} records</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <button className="btn btn-outline btn-icon" onClick={() => setPage(p => p - 1)} disabled={page === 1} style={{ padding: '0.4rem 0.6rem' }}>
              <ChevronLeft size={16} />
            </button>
            {getPageNumbers().map((p, i) =>
              p === '...' ? (
                <span key={`e-${i}`} style={{ padding: '0 0.5rem' }}>…</span>
              ) : (
                <button key={p} className={`btn ${p === page ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPage(p as number)} style={{ padding: '0.4rem 0.75rem', minWidth: '2.25rem' }}>
                  {p}
                </button>
              )
            )}
            <button className="btn btn-outline btn-icon" onClick={() => setPage(p => p + 1)} disabled={page === totalPages} style={{ padding: '0.4rem 0.6rem' }}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      <EditModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} rowData={currentRow} primaryKey={primaryKey} isNew={isNewRecord} />
      {toastMessage && <div className="toast">{toastMessage}</div>}
    </div>
  );
}

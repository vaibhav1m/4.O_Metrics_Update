"use client";

import { useState, useEffect, use } from "react";
import { ArrowLeft, PlusCircle } from "lucide-react";
import Link from "next/link";
import DynamicTable from "@/components/DynamicTable";
import EditModal from "@/components/EditModal";

export default function TablePage({ params }: { params: Promise<{ table: string }> }) {
  const { table } = use(params);
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentRow, setCurrentRow] = useState<any>(null);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  const primaryKey = table === 'v3_t_master_modules' ? 'module_id' : 'id';
  
  const formattedTableName = table
    .replace('v3_t_', '')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  useEffect(() => {
    fetchData();
  }, [table]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tables/${table}`);
      const result = await res.json();
      
      if (result.error) {
          showToast(`Error: ${result.error}`);
          return;
      }
      
      let newColumns = result.columns || [];
      // If we joined platform_name, add it to the logical columns list for the UI immediately
      if (result.hasPlatformId && !newColumns.includes('platform_name')) {
          newColumns = [...newColumns, 'platform_name'];
      }
      
      setColumns(newColumns);
      if (result.data) setData(result.data);

    } catch (error) {
      console.error("Failed to fetch data", error);
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
      // Don't initialize virtual joined columns for new insert forms
      if (col !== 'platform_name') defaultData[col] = "";
    });
    
    setCurrentRow(defaultData);
    setIsNewRecord(true);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    try {
      const res = await fetch(`/api/tables/${table}?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setData(prev => prev.filter(r => r[primaryKey] !== id));
        showToast("Record deleted successfully");
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } catch (error) {
      console.error("Failed to delete", error);
    }
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
        fetchData(); // Refetch to get updated/new data
        showToast(`Record ${isCreate ? 'created' : 'updated'} successfully`);
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error("Failed to save", error);
    }
  };

  const filteredData = data.filter(row => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return columns.some(col => {
      const val = row[col];
      if (val === null || val === undefined) return false;
      if (typeof val === 'object') return JSON.stringify(val).toLowerCase().includes(searchLower);
      return String(val).toLowerCase().includes(searchLower);
    });
  });

  return (
    <div className="container">
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
        <Link href="/" className="btn btn-icon btn-outline">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1>{formattedTableName} Table</h1>
          <p style={{ color: "var(--text-secondary)" }}>Manage data entries dynamically.</p>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div style={{ position: "relative" }}>
          <input 
            type="text" 
            placeholder="Search all records..." 
            className="input-field" 
            style={{ minWidth: "300px", paddingLeft: "1rem" }}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <button onClick={handleCreateNew} className="btn btn-primary" disabled={columns.length === 0}>
          <PlusCircle size={18} /> Add New Entry
        </button>
      </div>

      <div className="glass-card" style={{ padding: "0", background: "transparent", border: "none", boxShadow: "none" }}>
        {loading ? (
          <div className="empty-state">Loading data...</div>
        ) : (
          <DynamicTable 
            data={filteredData}  
            schemaColumns={columns}
            primaryKey={primaryKey}
            onEdit={handleEdit} 
            onDelete={handleDelete} 
          />
        )}
      </div>

      <EditModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        rowData={currentRow}
        primaryKey={primaryKey}
        isNew={isNewRecord}
      />

      {toastMessage && (
        <div className="toast">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

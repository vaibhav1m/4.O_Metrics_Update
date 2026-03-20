"use client";

import { Edit, Trash2 } from "lucide-react";

interface DynamicTableProps {
  data: any[];
  schemaColumns: string[];
  primaryKey: string;
  onEdit: (row: any) => void;
  onDelete: (id: string) => void;
}

export default function DynamicTable({ data, schemaColumns, primaryKey, onEdit, onDelete }: DynamicTableProps) {
  if (!schemaColumns || schemaColumns.length === 0) {
    return (
      <div className="empty-state">
        <DatabaseIcon />
        <p>Could not load table schema.</p>
      </div>
    );
  }

  const renderCellData = (value: any) => {
    if (value === null || value === undefined) return <span style={{ color: "var(--text-secondary)" }}>null</span>;
    if (typeof value === "object") {
      return (
        <pre style={{ fontSize: "0.75rem", background: "rgba(0,0,0,0.2)", padding: "0.25rem", borderRadius: "4px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>
          {JSON.stringify(value)}
        </pre>
      );
    }
    if (typeof value === "boolean") return value ? "True" : "False";
    if (typeof value === "string" && value.length > 20 && !isNaN(Date.parse(value))) {
        return new Date(value).toLocaleString();
    }
    return String(value);
  };

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            {schemaColumns.map(col => (
              <th key={col}>{col.replace(/_/g, " ")}</th>
            ))}
            <th style={{ textAlign: "right", position: "sticky", right: 0, background: "rgba(15, 23, 42, 0.9)" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={schemaColumns.length + 1} style={{ textAlign: "center", padding: "3rem" }}>
                <p style={{ color: "var(--text-secondary)" }}>No matching records found.</p>
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr key={row[primaryKey] || idx}>
                {schemaColumns.map(col => (
                  <td key={col} title={String(row[col])}>
                    <div style={{ maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {renderCellData(row[col])}
                    </div>
                  </td>
                ))}
                <td style={{ textAlign: "right", position: "sticky", right: 0, background: "rgba(30, 41, 59, 0.8)", backdropFilter: "blur(4px)" }}>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                    <button onClick={() => onEdit(row)} className="btn btn-icon btn-outline" title="Edit Record">
                      <Edit size={16} className="text-accent" style={{ color: "var(--accent-color)" }} />
                    </button>
                    <button onClick={() => onDelete(row[primaryKey])} className="btn btn-icon btn-outline" style={{ borderColor: "rgba(239, 68, 68, 0.3)" }} title="Delete Record">
                      <Trash2 size={16} className="text-danger" style={{ color: "var(--danger-color)" }} />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function DatabaseIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 1rem", opacity: 0.5 }}>
      <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
      <path d="M3 5V19A9 3 0 0 0 21 19V5"></path>
      <path d="M3 12A9 3 0 0 0 21 12"></path>
    </svg>
  );
}

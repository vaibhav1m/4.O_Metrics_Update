"use client";

import { useState, useEffect } from "react";
import { XIcon as X } from "lucide-animated";

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  rowData: any;
  primaryKey: string;
  isNew?: boolean;
}

export default function EditModal({ isOpen, onClose, onSave, rowData, primaryKey, isNew = false }: EditModalProps) {
  const [formData, setFormData] = useState<any>({});
  const [errors, setErrors] = useState<any>({});

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && rowData) {
      const initialData = { ...rowData };
      
      Object.keys(initialData).forEach(key => {
        if (typeof initialData[key] === 'object' && initialData[key] !== null) {
          initialData[key] = JSON.stringify(initialData[key], null, 2);
        }
      });
      
      setFormData(initialData);
      setErrors({});
    }
  }, [isOpen, rowData]);

  if (!isOpen) return null;

  const handleChange = (key: string, value: string) => {
    setFormData((prev: any) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev: any) => ({ ...prev, [key]: null }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const processedData = { ...formData };
    const newErrors: any = {};
    let hasError = false;

    Object.keys(processedData).forEach(key => {
        const val = processedData[key];
        if (typeof val === 'string' && (val.trim().startsWith('{') || val.trim().startsWith('['))) {
            try {
                processedData[key] = JSON.parse(val);
            } catch (err) {
                newErrors[key] = "Invalid JSON format";
                hasError = true;
            }
        }
    });

    if (hasError) {
        setErrors(newErrors);
        return;
    }

    onSave(processedData);
  };

  const columns = Object.keys(formData);
  const readOnlyFields = isNew 
    ? [primaryKey, "created_time_stamp", "updated_time_stamp", "platform_name"] 
    : [primaryKey, "created_time_stamp", "updated_time_stamp", "created_by", "platform_name"];

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{isNew ? "Create New Record" : "Edit Record"}</h2>
          <button onClick={onClose} className="btn btn-icon btn-outline">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div style={{ display: "grid", gap: "1rem" }}>
              {columns.map(col => {
                const isReadOnly = readOnlyFields.includes(col);
                
                // Determine if it's a large text field (like jsonb or text area)
                const isLargeText = 
                    col.endsWith('_arr') || 
                    col.includes('json') || 
                    (typeof formData[col] === 'string' && (formData[col].length > 100 || formData[col].includes('\n') || formData[col].startsWith('{') || formData[col].startsWith('[')));
                
                return (
                  <div key={col} className="input-group">
                    <label className="input-label" htmlFor={col}>
                      {col.replace(/_/g, " ").toUpperCase()} {isReadOnly && "(Read Only)"}
                    </label>
                    
                    {isLargeText ? (
                        <textarea
                            id={col}
                            className="input-field"
                            value={formData[col] || ""}
                            onChange={e => handleChange(col, e.target.value)}
                            disabled={isReadOnly}
                            style={{ minHeight: "120px", fontFamily: "monospace", opacity: isReadOnly ? 0.6 : 1 }}
                        />
                    ) : (
                        <input
                            id={col}
                            type="text"
                            className="input-field"
                            value={formData[col] || ""}
                            onChange={e => handleChange(col, e.target.value)}
                            disabled={isReadOnly}
                            style={{ opacity: isReadOnly ? 0.6 : 1 }}
                        />
                    )}
                    {errors[col] && <span style={{ color: "var(--danger-color)", fontSize: "0.75rem" }}>{errors[col]}</span>}
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-outline">Cancel</button>
            <button type="submit" className="btn btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}

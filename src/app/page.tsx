"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Database, LayoutTemplate, BoxSelect, Settings, Plus, Trash2 } from 'lucide-react';

const ICONS: Record<string, any> = {
  Database: Database,
  LayoutTemplate: LayoutTemplate,
  BoxSelect: BoxSelect,
  Settings: Settings
};

export default function Home() {
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTable, setNewTable] = useState({ id: '', name: '', desc: '', icon: 'Database', color: '#60a5fa' });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTables();
  }, []);

  const fetchTables = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/config');
      const data = await res.json();
      setTables(data);
    } catch (err) {
      console.error("Failed to load tables config", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTable)
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to add table');
      
      setIsModalOpen(false);
      setNewTable({ id: '', name: '', desc: '', icon: 'Database', color: '#60a5fa' });
      fetchTables();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!window.confirm('Are you sure you want to remove this table configuration?')) return;
    
    try {
      const res = await fetch(`/api/config?id=${id}`, { method: 'DELETE' });
      if (res.ok) fetchTables();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="container">
      <div className="mb-8 text-center" style={{ marginTop: '4rem' }}>
        <h1 style={{ fontSize: '3rem', background: 'linear-gradient(to right, #60a5fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Database Admin Portal
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '600px', margin: '1rem auto' }}>
          Select a mapped table to view, edit, or delete metrics and configurations.
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={18} /> Add New Table Config
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Loading configurations...</div>
      ) : (
        <div className="grid-cards">
          {tables.map(table => {
            const IconComponent = ICONS[table.icon] || Database;
            return (
              <Link href={`/${table.id}`} key={table.id}>
                <div className="glass-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', cursor: 'pointer', position: 'relative' }}>
                  <button 
                    onClick={(e) => handleDelete(e, table.id)}
                    className="btn-icon" 
                    style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger-color)', opacity: 0.5 }}
                    title="Delete Table Config"
                  >
                    <Trash2 size={18} />
                  </button>
                  <div style={{ marginBottom: '1rem' }}>
                    <IconComponent size={32} style={{ color: table.color }} />
                  </div>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>{table.name}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', flexGrow: 1 }}>{table.desc}</p>
                  <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Manage Table</span>
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
              <h2>Add New Table Configuration</h2>
              <button className="btn btn-icon btn-outline" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleAddTable}>
              <div className="modal-body">
                {error && <div style={{ color: 'var(--danger-color)', marginBottom: '1rem' }}>{error}</div>}
                
                <div className="input-group">
                  <label className="input-label">Table Name in Database (e.g. v3_t_new_table)</label>
                  <input required className="input-field" value={newTable.id} onChange={e => setNewTable({...newTable, id: e.target.value})} />
                </div>
                
                <div className="input-group">
                  <label className="input-label">Display Name (e.g. New Table)</label>
                  <input required className="input-field" value={newTable.name} onChange={e => setNewTable({...newTable, name: e.target.value})} />
                </div>
                
                <div className="input-group">
                  <label className="input-label">Description</label>
                  <input required className="input-field" value={newTable.desc} onChange={e => setNewTable({...newTable, desc: e.target.value})} />
                </div>

                <div className="input-group">
                  <label className="input-label">Icon Color (Hex)</label>
                  <input type="color" className="input-field" value={newTable.color} onChange={e => setNewTable({...newTable, color: e.target.value})} style={{ height: '50px', padding: '0.5rem' }} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Configuration</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Database, LayoutTemplate, BoxSelect, Settings, Plus, Trash2, Pencil } from 'lucide-react';

const ICONS: Record<string, any> = {
  Database: Database,
  LayoutTemplate: LayoutTemplate,
  BoxSelect: BoxSelect,
  Settings: Settings
};

const EMPTY_FORM = { id: '', name: '', desc: '', icon: 'Database', color: '#60a5fa', primaryKey: 'id' };

export default function Home() {
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
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

  const openAddModal = () => {
    setIsEditMode(false);
    setFormData(EMPTY_FORM);
    setError('');
    setIsModalOpen(true);
  };

  const openEditModal = (e: React.MouseEvent, table: any) => {
    e.preventDefault();
    setIsEditMode(true);
    setFormData({
      id: table.id,
      name: table.name,
      desc: table.desc,
      icon: table.icon || 'Database',
      color: table.color || '#60a5fa',
      primaryKey: table.primaryKey || 'id',
    });
    setError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/config', {
        method: isEditMode ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to save');

      setIsModalOpen(false);
      setFormData(EMPTY_FORM);
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
        <button className="btn btn-primary" onClick={openAddModal}>
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
                  <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '0.4rem' }}>
                    <button
                      onClick={(e) => openEditModal(e, table)}
                      className="btn-icon"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-color)', opacity: 0.6 }}
                      title="Edit Table Config"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, table.id)}
                      className="btn-icon"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger-color)', opacity: 0.5 }}
                      title="Delete Table Config"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
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
              <h2>{isEditMode ? 'Edit Table Configuration' : 'Add New Table Configuration'}</h2>
              <button className="btn btn-icon btn-outline" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div style={{ color: 'var(--danger-color)', marginBottom: '1rem' }}>{error}</div>}

                <div className="input-group">
                  <label className="input-label">Table Name in Database (e.g. v3_t_new_table)</label>
                  <input
                    required
                    className="input-field"
                    value={formData.id}
                    onChange={e => setFormData({ ...formData, id: e.target.value })}
                    disabled={isEditMode}
                    style={isEditMode ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Display Name (e.g. New Table)</label>
                  <input required className="input-field" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                </div>

                <div className="input-group">
                  <label className="input-label">Description</label>
                  <input required className="input-field" value={formData.desc} onChange={e => setFormData({ ...formData, desc: e.target.value })} />
                </div>

                <div className="input-group">
                  <label className="input-label">Primary Key Column</label>
                  <input required className="input-field" value={formData.primaryKey} onChange={e => setFormData({ ...formData, primaryKey: e.target.value })} placeholder="id" />
                </div>

                <div className="input-group">
                  <label className="input-label">Icon Color (Hex)</label>
                  <input type="color" className="input-field" value={formData.color} onChange={e => setFormData({ ...formData, color: e.target.value })} style={{ height: '50px', padding: '0.5rem' }} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{isEditMode ? 'Update Configuration' : 'Save Configuration'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

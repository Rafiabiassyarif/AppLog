import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Trash2, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge, ConfirmModal, PageHeading } from '../components.jsx';
import { TYPE_LABEL, formatDateTime } from '../lib/format.js';

export default function TrashView({ info, admin, reload, notify }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [purging, setPurging] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setItems(await api('/api/trash'));
    } catch (e) {
      setError(e.message);
      setItems([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function restore(app) {
    try {
      await api(`/api/apps/${app.id}/restore`, { method: 'POST' });
      await Promise.all([load(), reload()]);
      notify(`${app.name} dipulihkan.`);
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  async function purge() {
    setBusy(true);
    try {
      await api(`/api/trash/${purging.id}`, { method: 'DELETE' });
      await load();
      setPurging(null);
      notify('Aplikasi dihapus permanen.');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading info={info} />
      <section className="registry">
        <div className="section-title">
          <div>
            <h2>Aplikasi terhapus<span className="count-badge">{items?.length ?? 0}</span></h2>
          </div>
        </div>
        {error && <div className="error-banner" role="alert">{error}<button onClick={load}>Coba lagi</button></div>}
        {!items ? (
          <div className="empty-state"><Loader2 className="spin" /><p>Memuat...</p></div>
        ) : !items.length ? (
          <div className="empty-state"><span className="empty-icon"><Trash2 size={30} /></span><h3>Sampah kosong.</h3></div>
        ) : (
          <div className="table-scroll">
            <table className="apps-table">
              <thead><tr><th>NAMA APLIKASI</th><th>JENIS</th><th>STATUS</th><th>PEMBUAT</th><th>DIHAPUS</th><th>AKSI</th></tr></thead>
              <tbody>
                {items.map(app => (
                  <tr key={app.id}>
                    <td><b>{app.name}</b></td>
                    <td><span className={'type-tag ' + app.type}>{TYPE_LABEL[app.type]}</span></td>
                    <td><Badge status={app.status} /></td>
                    <td>{app.owner}</td>
                    <td>{formatDateTime(app.deletedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-btn" title="Pulihkan" aria-label={`Pulihkan ${app.name}`} onClick={() => restore(app)}><RotateCcw size={15} /></button>
                        {admin && <button className="icon-btn danger" title="Hapus permanen" aria-label={`Hapus permanen ${app.name}`} onClick={() => setPurging(app)}><Trash2 size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {purging && (
        <ConfirmModal
          title="Hapus permanen?"
          subtitle="Tindakan ini tidak dapat dibatalkan."
          message={<><b>{purging.name}</b> akan dihapus selamanya dari data AppLog.</>}
          confirmLabel="Hapus permanen"
          busy={busy}
          onConfirm={purge}
          close={() => setPurging(null)}
        />
      )}
    </>
  );
}

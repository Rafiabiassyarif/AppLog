import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Trash2, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge, Button, ConfirmModal, PageHeading } from '../components.jsx';
import { TYPE_LABEL, formatDateTime } from '../lib/format.js';

export default function TrashView({ info, admin, reload, notify }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  // { kind: 'purge', app } | { kind: 'purgeAll' } | { kind: 'restoreAll' }
  const [confirm, setConfirm] = useState(null);
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

  async function run(action) {
    setBusy(true);
    try {
      const message = await action();
      setConfirm(null);
      notify(message);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const purge = app => run(async () => {
    await api(`/api/trash/${app.id}`, { method: 'DELETE' });
    await load();
    return `${app.name} dihapus permanen.`;
  });

  const purgeAll = () => run(async () => {
    const { removed } = await api('/api/trash', { method: 'DELETE' });
    await load();
    return `${removed} aplikasi dihapus permanen.`;
  });

  const restoreAll = () => run(async () => {
    const { restored, skipped } = await api('/api/trash/restore', { method: 'POST' });
    await Promise.all([load(), reload()]);
    const done = `${restored.length} aplikasi dipulihkan.`;
    return skipped.length ? `${done} Dilewati karena namanya sudah dipakai: ${skipped.join(', ')}.` : done;
  });

  const count = items?.length ?? 0;
  const scope = admin ? 'Semua aplikasi di Sampah' : 'Semua aplikasi milikmu di Sampah';

  return (
    <>
      <PageHeading info={info} />
      <section className="registry">
        <div className="section-title">
          <div>
            <h2>Aplikasi terhapus<span className="count-badge">{count}</span></h2>
          </div>
          {count > 0 && (
            <div className="trash-actions">
              <Button secondary onClick={() => setConfirm({ kind: 'restoreAll' })}><RotateCcw size={15} />Pulihkan semua</Button>
              <Button danger onClick={() => setConfirm({ kind: 'purgeAll' })}><Trash2 size={15} />Hapus semua</Button>
            </div>
          )}
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
                        <button className="icon-btn danger" title="Hapus permanen" aria-label={`Hapus permanen ${app.name}`} onClick={() => setConfirm({ kind: 'purge', app })}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {confirm?.kind === 'purge' && (
        <ConfirmModal
          title="Hapus permanen?"
          subtitle="Tindakan ini tidak dapat dibatalkan."
          message={<><b>{confirm.app.name}</b> akan dihapus selamanya dari data AppLog.</>}
          confirmLabel="Hapus permanen"
          busy={busy}
          onConfirm={() => purge(confirm.app)}
          close={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'purgeAll' && (
        <ConfirmModal
          title="Hapus semua permanen?"
          subtitle="Tindakan ini tidak dapat dibatalkan."
          message={<>{scope} (<b>{count} aplikasi</b>) akan dihapus selamanya dari data AppLog.</>}
          confirmLabel="Hapus semua"
          busy={busy}
          onConfirm={purgeAll}
          close={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'restoreAll' && (
        <ConfirmModal
          title="Pulihkan semua?"
          subtitle="Aplikasi kembali ke daftar aplikasi."
          message={<>{scope} (<b>{count} aplikasi</b>) akan dipulihkan. Aplikasi yang namanya sudah dipakai akan dilewati.</>}
          confirmLabel="Pulihkan semua"
          danger={false}
          busy={busy}
          onConfirm={restoreAll}
          close={() => setConfirm(null)}
        />
      )}
    </>
  );
}

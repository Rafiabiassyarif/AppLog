import React, { useCallback, useEffect, useState } from 'react';
import { History, Loader2, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { Button, ConfirmModal, PageHeading } from '../components.jsx';
import { formatDateTime } from '../lib/format.js';

const ACTIONS = {
  setup: 'Menyiapkan workspace',
  password: 'Mengganti password',
  profile: 'Memperbarui profil',
  'user.create': 'Membuat akun',
  'user.update': 'Mengubah akun',
  'user.reset-password': 'Mengubah password anggota',
  'user.delete': 'Menghapus akun',
  'app.create': 'Menambah aplikasi',
  'app.update': 'Mengubah aplikasi',
  'app.delete': 'Memindahkan ke Sampah',
  'app.restore': 'Memulihkan aplikasi',
  'app.purge': 'Menghapus permanen',
  'audit.clear': 'Menghapus semua riwayat',
};

export default function AuditView({ info, notify }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  // { kind: 'one', item } | { kind: 'all' }
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError('');
    return api('/api/audit').then(setItems).catch(e => { setError(e.message); setItems([]); });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove() {
    setBusy(true);
    try {
      if (confirm.kind === 'all') {
        const { removed } = await api('/api/audit', { method: 'DELETE' });
        notify(`${removed} catatan riwayat dihapus.`);
      } else {
        await api(`/api/audit/${confirm.item.id}`, { method: 'DELETE' });
        notify('Catatan riwayat dihapus.');
      }
      await load();
      setConfirm(null);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const count = items?.length ?? 0;

  return (
    <>
      <PageHeading info={info} />
      <section className="registry">
        <div className="section-title">
          <div>
            <h2>Aktivitas terbaru<span className="count-badge">{count}</span></h2>
          </div>
          {count > 0 && <Button danger onClick={() => setConfirm({ kind: 'all' })}><Trash2 size={15} />Hapus semua</Button>}
        </div>
        {error && <div className="error-banner" role="alert">{error}<button onClick={load}>Coba lagi</button></div>}
        {!items ? (
          <div className="empty-state"><Loader2 className="spin" /><p>Memuat...</p></div>
        ) : !items.length ? (
          <div className="empty-state"><span className="empty-icon"><History size={30} /></span><h3>Belum ada aktivitas.</h3></div>
        ) : (
          <div className="table-scroll">
            <table className="apps-table">
              <thead><tr><th>WAKTU</th><th>OLEH</th><th>AKTIVITAS</th><th>TARGET</th><th>KETERANGAN</th><th>AKSI</th></tr></thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.at)}</td>
                    <td>{item.userName}</td>
                    <td>{ACTIONS[item.action] || item.action}</td>
                    <td><b>{item.target}</b></td>
                    <td>{item.detail || '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-btn danger" title="Hapus catatan" aria-label={`Hapus catatan ${ACTIONS[item.action] || item.action} ${item.target}`} onClick={() => setConfirm({ kind: 'one', item })}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {confirm && (
        <ConfirmModal
          title={confirm.kind === 'all' ? 'Hapus semua riwayat?' : 'Hapus catatan ini?'}
          subtitle="Tindakan ini tidak dapat dibatalkan."
          message={confirm.kind === 'all'
            ? <>Semua <b>{count} catatan</b> riwayat akan dihapus. Satu catatan baru dibuat untuk mencatat siapa yang menghapus.</>
            : <>Catatan <b>{ACTIONS[confirm.item.action] || confirm.item.action}</b> pada <b>{confirm.item.target}</b> ({formatDateTime(confirm.item.at)}) akan dihapus.</>}
          confirmLabel={confirm.kind === 'all' ? 'Hapus semua' : 'Hapus catatan'}
          busy={busy}
          onConfirm={remove}
          close={() => setConfirm(null)}
        />
      )}
    </>
  );
}

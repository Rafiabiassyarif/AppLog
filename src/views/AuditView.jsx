import React, { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { PageHeading } from '../components.jsx';
import { formatDateTime } from '../lib/format.js';

const ACTIONS = {
  setup: 'Menyiapkan workspace',
  password: 'Mengganti password',
  'user.create': 'Membuat akun',
  'user.update': 'Mengubah akun',
  'user.reset-password': 'Reset password',
  'user.delete': 'Menghapus akun',
  'app.create': 'Menambah aplikasi',
  'app.update': 'Mengubah aplikasi',
  'app.delete': 'Memindahkan ke Sampah',
  'app.restore': 'Memulihkan aplikasi',
  'app.purge': 'Menghapus permanen',
};

export default function AuditView({ info }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/audit').then(setItems).catch(e => { setError(e.message); setItems([]); });
  }, []);

  return (
    <>
      <PageHeading info={info} />
      <section className="registry">
        <div className="section-title">
          <div>
            <h2>Aktivitas terbaru<span className="count-badge">{items?.length ?? 0}</span></h2>
          </div>
        </div>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {!items ? (
          <div className="empty-state"><Loader2 className="spin" /><p>Memuat...</p></div>
        ) : !items.length ? (
          <div className="empty-state"><span className="empty-icon"><History size={30} /></span><h3>Belum ada aktivitas.</h3></div>
        ) : (
          <div className="table-scroll">
            <table className="apps-table">
              <thead><tr><th>WAKTU</th><th>OLEH</th><th>AKTIVITAS</th><th>TARGET</th><th>KETERANGAN</th></tr></thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.at)}</td>
                    <td>{item.userName}</td>
                    <td>{ACTIONS[item.action] || item.action}</td>
                    <td><b>{item.target}</b></td>
                    <td>{item.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

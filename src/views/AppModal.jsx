import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button, Modal } from '../components.jsx';
import { LIMITS, STATUSES, formatDateTime } from '../lib/format.js';

export default function AppModal({ app, admin, user, busy, save, close }) {
  const readonly = Boolean(app.readOnly);
  const [form, setForm] = useState({ ...app, owner: readonly || admin ? app.owner : app.owner || user.name });
  const [error, setError] = useState('');
  const field = key => ({
    value: form[key] || '',
    onChange: event => setForm({ ...form, [key]: event.target.value }),
    disabled: readonly,
  });

  async function submit(event) {
    event.preventDefault();
    try {
      setError('');
      await save(form);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <Modal
      title={readonly ? 'Detail aplikasi' : app.id ? 'Edit aplikasi' : 'Tambah aplikasi'}
      close={close}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="full">Nama aplikasi <b>*</b>
            <input {...field('name')} required maxLength={LIMITS.name} placeholder="Contoh: Inventory Management" />
          </label>
          <label>Jenis aplikasi
            <select {...field('type')}><option value="internal">Internal</option><option value="personal">Personal</option></select>
          </label>
          <label>Status
            <select {...field('status')}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
          </label>
          <label>Pembuat <b>*</b>
            <input {...field('owner')} readOnly={!admin} required maxLength={LIMITS.owner} />
          </label>
          <label>Tahun
            <input {...field('year')} type="number" min="2000" max="2100" step="1" />
          </label>
          <label className="full">Teknologi
            <input {...field('tech')} placeholder="React, Node.js, PostgreSQL" maxLength={LIMITS.tech} />
            <small>Pisahkan setiap teknologi dengan koma.</small>
          </label>
          <label className="full">Link aplikasi atau repository
            <input {...field('link')} type="url" maxLength={LIMITS.link} placeholder="https://..." />
          </label>
          <label className="full">Deskripsi
            <textarea {...field('description')} maxLength={LIMITS.description} rows={3} placeholder="Jelaskan singkat fungsi aplikasi ini." />
            {!readonly && <small>{(form.description || '').length}/{LIMITS.description} karakter</small>}
          </label>
        </div>
        {readonly && app.updatedAt && <p className="muted meta-line">Terakhir diperbarui {formatDateTime(app.updatedAt)}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-footer">
          <Button secondary type="button" onClick={close} disabled={busy}>{readonly ? 'Tutup' : 'Batal'}</Button>
          {!readonly && <Button disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}Simpan aplikasi</Button>}
        </div>
      </form>
    </Modal>
  );
}

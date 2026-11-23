import React, { useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button, Modal } from '../components.jsx';
import { LIMITS, STATUSES, formatDateTime, initials } from '../lib/format.js';
import { logoFromFile } from '../lib/logo.js';

export default function AppModal({ app, admin, user, busy, save, close }) {
  const readonly = Boolean(app.readOnly);
  const [form, setForm] = useState({ ...app, owner: readonly || admin ? app.owner : app.owner || user.name });
  const [error, setError] = useState('');
  const field = key => ({
    value: form[key] || '',
    onChange: event => setForm({ ...form, [key]: event.target.value }),
    disabled: readonly,
  });

  const fileInput = useRef(null);
  async function pickLogo(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      setError('');
      const logo = await logoFromFile(file);
      setForm(current => ({ ...current, logo }));
    } catch (e) {
      setError(e.message);
    }
  }

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
          <div className="full logo-row">
            <button
              type="button"
              className={'logo-picker' + (form.logo ? ' has-logo' : '')}
              onClick={() => fileInput.current.click()}
              disabled={readonly}
              aria-label={form.logo ? 'Ganti logo' : 'Unggah logo'}
              title={readonly ? undefined : form.logo ? 'Ganti logo' : 'Unggah logo'}
            >
              {form.logo ? <img src={form.logo} alt="Logo aplikasi" /> : <span>{initials(form.name)}</span>}
              {!readonly && <span className="logo-overlay"><ImagePlus size={18} /></span>}
            </button>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickLogo} />
            <label className="logo-name">Nama aplikasi <b>*</b>
              <input {...field('name')} required maxLength={LIMITS.name} placeholder="Contoh: Inventory Management" />
            </label>
            {!readonly && (
              <p className="logo-hint">
                {form.logo
                  ? <span className="logo-actions">
                      <button type="button" className="chip-btn" onClick={() => fileInput.current.click()}><ImagePlus size={13} />Ganti logo</button>
                      <button type="button" className="chip-btn danger" onClick={() => setForm({ ...form, logo: '' })}><Trash2 size={13} />Hapus</button>
                    </span>
                  : 'Klik kotak untuk unggah logo (PNG, JPG, WebP).'}
              </p>
            )}
          </div>
          <label>Jenis aplikasi
            <select {...field('type')}><option value="internal">Internal</option><option value="personal">Personal</option></select>
          </label>
          <label>Status
            <select {...field('status')}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
          </label>
          <label>Mulai dikerjakan
            <input {...field('startDate')} type="date" min="2000-01-01" max="2100-12-31" />
            {!form.startDate && form.year && <small>Data lama: tahun {form.year}.</small>}
          </label>
          <label>Selesai dikerjakan
            <input {...field('endDate')} type="date" min={form.startDate || '2000-01-01'} max="2100-12-31" />
            {!readonly && !form.endDate && <small>Kosongkan bila masih berjalan.</small>}
          </label>
          <label>Pembuat <b>*</b>
            <input {...field('owner')} readOnly={!admin} required maxLength={LIMITS.owner} />
          </label>
          <label>Teknologi
            <input {...field('tech')} placeholder="React, Node.js, PostgreSQL" maxLength={LIMITS.tech} />
            <small>Pisahkan dengan koma.</small>
          </label>
          <label className="full">Link aplikasi atau repository
            <input {...field('link')} type="url" maxLength={LIMITS.link} placeholder="https://..." />
          </label>
          <label className="full">Deskripsi
            <textarea {...field('description')} maxLength={LIMITS.description} rows={3} placeholder="Jelaskan singkat fungsi aplikasi ini." />
            {!readonly && <small className="counter">{(form.description || '').length}/{LIMITS.description} karakter</small>}
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

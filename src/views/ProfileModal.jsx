import React, { useEffect, useRef, useState } from 'react';
import { Bot, BookOpen, Camera, Check, Copy, ImagePlus, KeyRound, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { photoFromFile } from '../lib/logo.js';
import { Avatar, Button, Modal } from '../components.jsx';
import { formatDateTime } from '../lib/format.js';

const BIO_MAX = 280; // sama dengan LIMITS.bio di server/validate.cjs

export default function ProfileModal({ user, close, notify, onSaved }) {
  const [form, setForm] = useState({ name: user.name, bio: user.bio || '', photo: user.photo || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef(null);

  async function pickPhoto(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      setError('');
      const photo = await photoFromFile(file);
      setForm(current => ({ ...current, photo }));
    } catch (e) {
      setError(e.message);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { user: saved } = await api('/api/profile', { method: 'PATCH', body: form });
      onSaved(saved);
      notify('Profil berhasil diperbarui.');
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Profil saya" subtitle="Foto, nama, dan bio tampil untuk anggota tim." close={close}>
      <form onSubmit={submit}>
        <div className="profile-editor">
          <button
            type="button"
            className="profile-photo"
            onClick={() => fileInput.current.click()}
            aria-label={form.photo ? 'Ganti foto' : 'Unggah foto'}
            title={form.photo ? 'Ganti foto' : 'Unggah foto'}
          >
            <Avatar name={form.name || user.name} photo={form.photo} size="xl" />
            <span className="profile-photo-badge"><Camera size={14} /></span>
          </button>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" hidden onChange={pickPhoto} />
          <div className="profile-editor-text">
            <b>{form.name || user.name}</b>
            <small>@{user.username} · {user.role === 'admin' ? 'Admin' : 'Anggota'}</small>
            <span className="logo-actions">
              <button type="button" className="chip-btn" onClick={() => fileInput.current.click()}><ImagePlus size={13} />{form.photo ? 'Ganti foto' : 'Unggah foto'}</button>
              {form.photo && <button type="button" className="chip-btn danger" onClick={() => setForm({ ...form, photo: '' })}><Trash2 size={13} />Hapus</button>}
            </span>
          </div>
        </div>
        <div className="form-grid">
          <label className="full">Nama <b>*</b>
            <input required maxLength={60} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
          </label>
          <label className="full">Bio
            <textarea rows={4} maxLength={BIO_MAX} placeholder="Ceritakan sedikit tentang dirimu, peran, atau keahlianmu." value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value })} />
            <small className="counter">{form.bio.length}/{BIO_MAX}</small>
          </label>
        </div>
        <ApiTokens notify={notify} />
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-footer">
          <Button secondary type="button" onClick={close} disabled={busy}>Batal</Button>
          <Button disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan profil'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Token API untuk AI agent (server MCP di mcp/applog-mcp.cjs).
 * Token utuh hanya tampil sekali setelah dibuat; server menyimpan hash-nya saja.
 */
function ApiTokens({ notify }) {
  const [tokens, setTokens] = useState(null);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/tokens').then(setTokens).catch(e => setError(e.message));
  }, []);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const created = await api('/api/tokens', { method: 'POST', body: { name: name.trim() } });
      setFresh(created);
      setCopied(false);
      setName('');
      setTokens(await api('/api/tokens'));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token) {
    if (!window.confirm(`Cabut token "${token.name}"? AI agent yang memakainya tidak bisa mengakses AppLog lagi.`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/tokens/${token.id}`, { method: 'DELETE' });
      setTokens(list => list.filter(t => t.id !== token.id));
      if (fresh && fresh.id === token.id) setFresh(null);
      notify('Token dicabut.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(fresh.token);
      setCopied(true);
    } catch {
      setError('Gagal menyalin. Pilih teks token lalu salin manual.');
    }
  }

  return (
    <section className="token-box">
      <header className="token-head">
        <span className="token-badge"><Bot size={18} /></span>
        <div>
          <h4>Token AI agent <span className="token-tag">MCP</span></h4>
          <p>Biarkan AI agent membaca dan mengisi data aplikasimu, dengan hak akses yang sama seperti akunmu.</p>
        </div>
        <a className="token-docs" href="/docs" target="_blank" rel="noopener noreferrer"><BookOpen size={14} />Docs API</a>
      </header>

      {fresh && (
        <div className="token-fresh" role="status">
          <b><KeyRound size={14} />Token "{fresh.name}" dibuat</b>
          <small>Salin sekarang. Token tidak akan ditampilkan lagi.</small>
          <div className="token-copy">
            <code>{fresh.token}</code>
            <button type="button" className={'token-copy-btn' + (copied ? ' copied' : '')} onClick={copy}>
              {copied ? <><Check size={14} />Tersalin</> : <><Copy size={14} />Salin</>}
            </button>
          </div>
          <small>Tempel sebagai <code>APPLOG_TOKEN</code> di konfigurasi MCP agent, atau kirim sebagai <code>Authorization: Bearer</code> (panduan di Docs API).</small>
        </div>
      )}

      {tokens && tokens.length > 0 && (
        <ul className="token-list">
          {tokens.map(t => (
            <li key={t.id}>
              <span className="token-key"><KeyRound size={14} /></span>
              <span className="token-meta">
                <b>{t.name}</b>
                <small><code>••••{t.hint}</code> · {t.lastUsedAt ? `dipakai ${formatDateTime(t.lastUsedAt)}` : 'belum pernah dipakai'}</small>
              </span>
              <button type="button" className="chip-btn danger" onClick={() => revoke(t)} disabled={busy}><Trash2 size={13} />Cabut</button>
            </li>
          ))}
        </ul>
      )}

      {tokens && !tokens.length && !fresh && (
        <ol className="token-steps">
          <li><span>1</span>Buat token</li>
          <li><span>2</span>Tempel di agent</li>
          <li><span>3</span>Suruh agent isi data</li>
        </ol>
      )}

      <div className="token-create">
        <label className="token-input">
          <KeyRound size={15} />
          <input
            value={name}
            maxLength={60}
            placeholder="Nama token, contoh: Claude di laptop"
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create(); } }}
            aria-label="Nama token baru"
          />
        </label>
        <Button type="button" onClick={create} disabled={busy || !name.trim()}><Plus size={15} />Buat token</Button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

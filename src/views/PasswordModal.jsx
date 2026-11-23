import React, { useState } from 'react';
import { api } from '../lib/api.js';
import { Button, Modal } from '../components.jsx';

export default function PasswordModal({ close, notify }) {
  const [form, setForm] = useState({ currentPassword: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = key => event => setForm({ ...form, [key]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Konfirmasi password baru tidak sama.');
      return;
    }
    if (form.password === form.currentPassword) {
      setError('Password baru harus berbeda dari password saat ini.');
      return;
    }
    setBusy(true);
    try {
      await api('/api/password', { method: 'POST', body: { currentPassword: form.currentPassword, password: form.password } });
      notify('Password berhasil diperbarui. Sesi di perangkat lain diakhiri.');
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Ubah password" close={close}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="full">Password saat ini
            <input type="password" autoComplete="current-password" required maxLength={128} value={form.currentPassword} onChange={set('currentPassword')} />
          </label>
          <label className="full">Password baru
            <input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={form.password} onChange={set('password')} />
            <small>Minimal 8 karakter.</small>
          </label>
          <label className="full">Ulangi password baru
            <input type="password" autoComplete="new-password" maxLength={128} required value={form.confirm} onChange={set('confirm')} />
          </label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-footer">
          <Button secondary type="button" onClick={close} disabled={busy}>Batal</Button>
          <Button disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan password'}</Button>
        </div>
      </form>
    </Modal>
  );
}

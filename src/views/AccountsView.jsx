import React, { useState } from 'react';
import { Plus, ShieldCheck, UserRound, Pencil, KeyRound, Trash2, Power } from 'lucide-react';
import { api } from '../lib/api.js';
import { Avatar, Button, ConfirmModal, Modal, PageHeading } from '../components.jsx';

const EMPTY = { name: '', username: '', password: '', confirm: '', role: 'member' };

function AccountForm({ account, close, onSaved }) {
  const editing = Boolean(account);
  const [form, setForm] = useState(editing ? { name: account.name, role: account.role } : EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = key => event => setForm({ ...form, [key]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!editing && form.password !== form.confirm) {
      setError('Konfirmasi password tidak sama.');
      return;
    }
    setBusy(true);
    try {
      if (editing) await api(`/api/users/${account.id}`, { method: 'PATCH', body: { name: form.name, role: form.role } });
      else await api('/api/users', { method: 'POST', body: form });
      await onSaved(editing ? 'Akun berhasil diperbarui.' : 'Akun berhasil dibuat.');
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={editing ? 'Edit akun' : 'Tambah akun'} subtitle={editing ? `@${account.username}` : undefined} close={close}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="full">Nama anggota<input required maxLength={60} value={form.name} onChange={set('name')} /></label>
          {!editing && (
            <label className="full">Username
              <input required pattern="[a-zA-Z0-9_.\-]{3,40}" value={form.username} onChange={set('username')} autoComplete="off" />
              <small>3–40 karakter: huruf, angka, titik, garis bawah atau tanda hubung.</small>
            </label>
          )}
          <label className="full">Peran
            <select value={form.role} onChange={set('role')}>
              <option value="member">User — mengelola aplikasi sendiri</option>
              <option value="admin">Admin — mengelola semua data dan akun</option>
            </select>
          </label>
          {!editing && (
            <>
              <label className="full">Password
                <input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={form.password} onChange={set('password')} />
                <small>Minimal 8 karakter.</small>
              </label>
              <label className="full">Ulangi password
                <input required type="password" maxLength={128} autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
              </label>
            </>
          )}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-footer">
          <Button secondary type="button" onClick={close} disabled={busy}>Batal</Button>
          <Button disabled={busy}>{busy ? 'Menyimpan...' : editing ? 'Simpan perubahan' : 'Buat akun'}</Button>
        </div>
      </form>
    </Modal>
  );
}

// Admin mengetik sendiri password baru untuk anggota (tidak dibuat acak).
function ResetPasswordForm({ account, close, onSaved }) {
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = key => event => setForm({ ...form, [key]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Konfirmasi password tidak sama.');
      return;
    }
    setBusy(true);
    try {
      await api(`/api/users/${account.id}/reset-password`, { method: 'POST', body: { password: form.password } });
      await onSaved(`Password @${account.username} berhasil diubah. Semua sesinya diakhiri.`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Ubah password anggota" subtitle={`@${account.username}`} close={close}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="full">Password baru
            <input required autoFocus type="password" minLength={8} maxLength={128} autoComplete="new-password" value={form.password} onChange={set('password')} />
            <small>Minimal 8 karakter. Berikan password ini ke anggota.</small>
          </label>
          <label className="full">Ulangi password baru
            <input required type="password" maxLength={128} autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
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

export default function AccountsView({ info, users, currentUser, reload, notify }) {
  const [form, setForm] = useState(null); // null | 'new' | user
  const [confirm, setConfirm] = useState(null); // { kind, user }
  const [resetting, setResetting] = useState(null);
  const [busy, setBusy] = useState(false);

  async function runConfirm() {
    const { kind, user } = confirm;
    setBusy(true);
    try {
      if (kind === 'toggle') {
        await api(`/api/users/${user.id}`, { method: 'PATCH', body: { active: !user.active } });
        notify(user.active ? 'Akun dinonaktifkan.' : 'Akun diaktifkan kembali.');
      } else if (kind === 'delete') {
        await api(`/api/users/${user.id}`, { method: 'DELETE' });
        notify('Akun dihapus. Aplikasinya tetap tersimpan.');
      }
      await reload();
      setConfirm(null);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const confirmText = confirm && {
    toggle: confirm.user.active
      ? { title: 'Nonaktifkan akun?', message: <><b>{confirm.user.name}</b> tidak bisa login sampai akun diaktifkan kembali.</>, label: 'Nonaktifkan', danger: true }
      : { title: 'Aktifkan akun?', message: <><b>{confirm.user.name}</b> bisa login kembali.</>, label: 'Aktifkan', danger: false },
    delete: { title: 'Hapus akun?', message: <>Akun <b>@{confirm.user.username}</b> dihapus permanen. Aplikasi buatannya tetap ada dan hanya bisa diubah Admin.</>, label: 'Hapus akun', danger: true },
  }[confirm.kind];

  return (
    <>
      <PageHeading info={info} action={<Button onClick={() => setForm('new')}><Plus size={17} />Tambah akun</Button>} />
      <section className="registry">
        <div className="section-title">
          <div>
            <h2>Akun anggota<span className="count-badge">{users.length}</span></h2>
          </div>
        </div>
        <div className="table-scroll">
          <table className="apps-table">
            <thead><tr><th>NAMA ANGGOTA</th><th>USERNAME</th><th>PERAN</th><th>STATUS</th><th>AKSI</th></tr></thead>
            <tbody>
              {users.map(u => {
                const self = u.id === currentUser.id;
                return (
                  <tr key={u.id}>
                    <td><span className="owner-cell"><Avatar name={u.name} photo={u.photo} /><span className="account-name"><b>{u.name}{self ? ' (kamu)' : ''}</b>{u.bio && <small title={u.bio}>{u.bio}</small>}</span></span></td>
                    <td>@{u.username}</td>
                    <td><span className="role-pill">{u.role === 'admin' ? <ShieldCheck size={13} /> : <UserRound size={13} />} {u.role === 'admin' ? 'Admin' : 'User'}</span></td>
                    <td>{u.active ? <span className="status done"><i />Aktif</span> : <span className="status inactive"><i />Nonaktif</span>}</td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-btn" title="Edit akun" aria-label={`Edit ${u.name}`} onClick={() => setForm(u)}><Pencil size={15} /></button>
                        {!self && (
                          <>
                            <button className="icon-btn" title="Ubah password" aria-label={`Ubah password ${u.name}`} onClick={() => setResetting(u)}><KeyRound size={15} /></button>
                            <button className="icon-btn" title={u.active ? 'Nonaktifkan' : 'Aktifkan'} aria-label={`${u.active ? 'Nonaktifkan' : 'Aktifkan'} ${u.name}`} onClick={() => setConfirm({ kind: 'toggle', user: u })}><Power size={15} /></button>
                            <button className="icon-btn danger" title="Hapus akun" aria-label={`Hapus ${u.name}`} onClick={() => setConfirm({ kind: 'delete', user: u })}><Trash2 size={15} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {form && (
        <AccountForm
          account={form === 'new' ? null : form}
          close={() => setForm(null)}
          onSaved={async message => {
            await reload();
            setForm(null);
            notify(message);
          }}
        />
      )}
      {confirm && (
        <ConfirmModal
          title={confirmText.title}
          message={confirmText.message}
          confirmLabel={confirmText.label}
          danger={confirmText.danger}
          busy={busy}
          onConfirm={runConfirm}
          close={() => setConfirm(null)}
        />
      )}
      {resetting && (
        <ResetPasswordForm
          account={resetting}
          close={() => setResetting(null)}
          onSaved={async message => {
            setResetting(null);
            notify(message);
          }}
        />
      )}
    </>
  );
}

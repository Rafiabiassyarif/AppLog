import React, { useState } from 'react';
import { Eye, EyeOff, AlertCircle, Loader2, ArrowRight, User, Lock, IdCard } from 'lucide-react';
import kroomboxMark from './kroombox-mark.svg?inline';
import { api } from './lib/api.js';
import { Brand, Button } from './components.jsx';

export default function Login({ onLogin, setupRequired, expired }) {
  const [form, setForm] = useState({ name: '', username: '', password: '', confirm: '' });
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = key => event => setForm({ ...form, [key]: event.target.value });
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (setupRequired && form.password !== form.confirm) {
      setError('Konfirmasi password tidak sama.');
      return;
    }
    setBusy(true);
    try {
      const url = setupRequired ? '/api/setup' : '/api/login';
      const { user } = await api(url, { method: 'POST', body: form, notifyUnauthorized: false });
      onLogin(user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const passwordType = visible ? 'text' : 'password';

  return (
    <main className="login-page">
      <section className="login-visual">
        <Brand light />
        <div className="login-pitch">
          <img className="login-mark" src={kroomboxMark} alt="Kroombox" />
          <h1>Direktori<br />aplikasi tim.</h1>
        </div>
        <footer>© {new Date().getFullYear()} Kroombox</footer>
      </section>

      <section className="login-form-side">
        <div className="login-card">
          <h2>{setupRequired ? 'Buat akun Admin' : 'Selamat datang'}</h2>
          <p className="login-sub">{setupRequired ? 'Admin pertama workspace ini.' : 'Masuk untuk melanjutkan.'}</p>
          {expired && !error && <p className="notice" role="status">Sesi berakhir. Silakan masuk kembali.</p>}

          <form onSubmit={submit}>
            {setupRequired && (
              <label className="login-field">
                <span>Nama</span>
                <div className="login-input">
                  <IdCard size={17} />
                  <input autoComplete="name" value={form.name} onChange={set('name')} required maxLength={60} />
                </div>
              </label>
            )}
            <label className="login-field">
              <span>Username</span>
              <div className="login-input">
                <User size={17} />
                <input
                  autoFocus
                  autoComplete="username"
                  value={form.username}
                  onChange={set('username')}
                  required
                  maxLength={40}
                  pattern={setupRequired ? '[a-zA-Z0-9_.-]{3,40}' : undefined}
                />
              </div>
            </label>
            <label className="login-field">
              <span>Password</span>
              <div className="login-input">
                <Lock size={17} />
                <input
                  type={passwordType}
                  autoComplete={setupRequired ? 'new-password' : 'current-password'}
                  value={form.password}
                  onChange={set('password')}
                  required
                  minLength={setupRequired ? 8 : undefined}
                  maxLength={128}
                />
                <button className="login-eye" aria-label={visible ? 'Sembunyikan password' : 'Tampilkan password'} type="button" onClick={() => setVisible(!visible)}>
                  {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {setupRequired && (
              <label className="login-field">
                <span>Ulangi password</span>
                <div className="login-input">
                  <Lock size={17} />
                  <input type={passwordType} autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required maxLength={128} />
                </div>
              </label>
            )}
            {error && <p className="login-error" role="alert"><AlertCircle size={16} />{error}</p>}
            <Button disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} /> : <>{setupRequired ? 'Buat & masuk' : 'Masuk'}<ArrowRight size={17} /></>}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}

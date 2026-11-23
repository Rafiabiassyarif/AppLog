import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutDashboard, FolderKanban, Users, LogOut, UserRound, Menu, Trash2, History, KeyRound } from 'lucide-react';
import { api } from './lib/api.js';
import { Avatar, Brand, Toast } from './components.jsx';
import AppsView from './views/AppsView.jsx';
import AccountsView from './views/AccountsView.jsx';
import TrashView from './views/TrashView.jsx';
import AuditView from './views/AuditView.jsx';
import PasswordModal from './views/PasswordModal.jsx';

const VIEWS = {
  overview: { title: 'Ringkasan' },
  apps: { title: 'Semua aplikasi' },
  mine: { title: 'Aplikasi saya' },
  trash: { title: 'Sampah' },
  users: { title: 'Kelola akun', admin: true },
  audit: { title: 'Riwayat perubahan', admin: true },
};
const FILTER_DEFAULTS = { q: '', type: 'all', status: 'all', sort: 'updated', page: 1, layout: 'table' };

/** Halaman dan filter disimpan di URL agar tetap sama setelah refresh dan tombol Back berfungsi. */
function readUrl(admin) {
  const params = new URLSearchParams(location.search);
  let view = params.get('view') || 'overview';
  if (!VIEWS[view] || (VIEWS[view].admin && !admin)) view = 'overview';
  return {
    view,
    filters: {
      q: params.get('q') || '',
      type: ['internal', 'personal'].includes(params.get('type')) ? params.get('type') : 'all',
      status: params.get('status') || 'all',
      sort: params.get('sort') || 'updated',
      page: Math.max(1, Number(params.get('page')) || 1),
      layout: params.get('layout') === 'grid' ? 'grid' : 'table',
    },
  };
}

function writeUrl(base, view, filters, push) {
  const params = new URLSearchParams();
  if (view !== 'overview') params.set('view', view);
  for (const [key, value] of Object.entries(filters)) {
    if (value !== FILTER_DEFAULTS[key]) params.set(key, String(value));
  }
  const url = base + (params.size ? `?${params}` : '');
  if (url !== location.pathname + location.search) history[push ? 'pushState' : 'replaceState'](null, '', url);
}

export default function Workspace({ user, onLogout }) {
  const admin = user.role === 'admin';
  const base = admin ? '/admin' : '/user';
  const initial = useRef(readUrl(admin)).current;
  const [view, setView] = useState(initial.view);
  const [filters, setFilters] = useState(initial.filters);
  const [apps, setApps] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const timer = useRef();

  const notify = useCallback((text, type = 'success') => {
    setToast({ text, type });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      setError('');
      const [appList, userList] = await Promise.all([api('/api/apps'), admin ? api('/api/users') : Promise.resolve([])]);
      setApps(appList);
      setUsers(userList);
    } catch (e) {
      if (e.status !== 401) setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [admin]);

  useEffect(() => {
    load();
    return () => clearTimeout(timer.current);
  }, [load]);

  useEffect(() => { writeUrl(base, view, filters, false); }, [base, view, filters]);
  useEffect(() => {
    const onPop = () => {
      const state = readUrl(admin);
      setView(state.view);
      setFilters(state.filters);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [admin]);

  function changeView(next) {
    setMobile(false);
    if (next === view) return;
    const nextFilters = { ...FILTER_DEFAULTS, layout: filters.layout };
    writeUrl(base, next, nextFilters, true);
    setView(next);
    setFilters(nextFilters);
  }

  async function logout() {
    try {
      await api('/api/logout', { method: 'POST', notifyUnauthorized: false });
    } catch {
      // Tetap keluar di sisi browser walaupun server tidak terjangkau.
    }
    onLogout();
  }

  const info = VIEWS[view];
  const nav = (key, Icon, label, count) => (
    <button className={'nav-item ' + (view === key ? 'active' : '')} onClick={() => changeView(key)} aria-current={view === key ? 'page' : undefined}>
      <Icon size={18} /><span>{label}</span>{count !== undefined && <small>{count}</small>}
    </button>
  );

  return (
    <div className="workspace">
      <aside className={'sidebar ' + (mobile ? 'mobile-open' : '')}>
        <Brand />
        <nav>
          {nav('overview', LayoutDashboard, 'Ringkasan')}
          {nav('apps', FolderKanban, 'Semua aplikasi', apps.length)}
          {nav('mine', UserRound, 'Aplikasi saya', apps.filter(a => a.createdBy === user.id).length)}
          {nav('trash', Trash2, 'Sampah')}
          {admin && (
            <>
              <hr className="nav-sep" />
              {nav('users', Users, 'Kelola akun', users.length)}
              {nav('audit', History, 'Riwayat perubahan')}
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <Avatar name={user.name} />
            <div><b>{user.name}</b><small>{admin ? 'Admin' : 'Anggota'}</small></div>
            <button className="icon-btn" title="Ubah password" aria-label="Ubah password" onClick={() => setPasswordModal(true)}><KeyRound size={16} /></button>
            <button className="icon-btn" title="Keluar" aria-label="Keluar" onClick={logout}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      {mobile && <button className="sidebar-overlay" aria-label="Tutup menu" onClick={() => setMobile(false)} />}

      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="icon-btn mobile-menu" onClick={() => setMobile(!mobile)} aria-label="Buka navigasi"><Menu size={20} /></button>
            <b>{info.title}</b>
          </div>
          <div className="topbar-right">
            <Avatar name={user.name} size="small" />
          </div>
        </header>

        <main className="page-content">
          {error && <div className="error-banner" role="alert">{error}<button onClick={load}>Coba lagi</button></div>}

          {['overview', 'apps', 'mine'].includes(view) && (
            <AppsView
              key={view}
              view={view}
              info={info}
              user={user}
              apps={apps}
              users={users}
              loading={loading}
              filters={filters}
              setFilters={setFilters}
              reload={load}
              notify={notify}
            />
          )}
          {view === 'trash' && <TrashView info={info} user={user} admin={admin} reload={load} notify={notify} />}
          {view === 'users' && <AccountsView info={info} users={users} currentUser={user} reload={load} notify={notify} />}
          {view === 'audit' && <AuditView info={info} />}        </main>
      </div>

      {passwordModal && <PasswordModal close={() => setPasswordModal(false)} notify={notify} />}
      <Toast toast={toast} />
    </div>
  );
}

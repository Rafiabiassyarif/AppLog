import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutDashboard, FolderKanban, Users, LogOut, UserRound, Menu, Trash2, History, KeyRound, ChevronLeft } from 'lucide-react';
import { api } from './lib/api.js';
import { Avatar, Brand, Toast } from './components.jsx';
import AppsView from './views/AppsView.jsx';
import AccountsView from './views/AccountsView.jsx';
import TrashView from './views/TrashView.jsx';
import AuditView from './views/AuditView.jsx';
import PasswordModal from './views/PasswordModal.jsx';
import ProfileModal from './views/ProfileModal.jsx';

const VIEWS = {
  overview: { title: 'Ringkasan' },
  apps: { title: 'Semua aplikasi' },
  mine: { title: 'Aplikasi saya' },
  trash: { title: 'Sampah' },
  users: { title: 'Kelola akun', admin: true },
  audit: { title: 'Riwayat perubahan', admin: true },
};
const COLLAPSE_KEY = 'applog.sidebarCollapsed';
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };

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
      type: ['internal', 'personal', 'project'].includes(params.get('type')) ? params.get('type') : 'all',
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

export default function Workspace({ user, onLogout, onUserChange }) {
  const admin = user.role === 'admin';
  const base = admin ? '/admin' : '/user';
  const initial = useRef(readUrl(admin)).current;
  const [view, setView] = useState(initial.view);
  const [filters, setFilters] = useState(initial.filters);
  const [apps, setApps] = useState([]);
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [profileModal, setProfileModal] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  function toggleCollapsed() {
    setCollapsed(current => {
      try { localStorage.setItem(COLLAPSE_KEY, current ? '0' : '1'); } catch { /* penyimpanan browser tidak tersedia */ }
      return !current;
    });
  }
  const timer = useRef();

  const notify = useCallback((text, type = 'success') => {
    setToast({ text, type, id: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      setError('');
      const [appList, userList, profileList] = await Promise.all([
        api('/api/apps'),
        admin ? api('/api/users') : Promise.resolve([]),
        api('/api/profiles').catch(() => []),
      ]);
      setApps(appList);
      setUsers(userList);
      setProfiles(profileList);
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

  // extra: filter awal, misalnya { status: 'Ide' } saat kartu Ringkasan diklik.
  function changeView(next, extra) {
    setMobile(false);
    if (next === view && !extra) return;
    const nextFilters = { ...FILTER_DEFAULTS, layout: filters.layout, ...extra };
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
  const nav = (key, Icon, label) => (
    <button className={'nav-item ' + (view === key ? 'active' : '')} onClick={() => changeView(key)} aria-current={view === key ? 'page' : undefined} title={collapsed ? label : undefined} aria-label={label}>
      <Icon size={18} /><span>{label}</span>
    </button>
  );

  return (
    <div className={'workspace' + (collapsed ? ' sidebar-collapsed' : '')}>
      <aside className={'sidebar ' + (mobile ? 'mobile-open' : '')}>
        <Brand
          href={base}
          onClick={event => {
            // Sudah login: logo kembali ke Ringkasan, bukan ke landing page.
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            changeView('overview');
          }}
        />
        <nav>
          {nav('overview', LayoutDashboard, 'Ringkasan')}
          {nav('apps', FolderKanban, 'Semua aplikasi')}
          {nav('mine', UserRound, 'Aplikasi saya')}
          {nav('trash', Trash2, 'Sampah')}
          {admin && (
            <>
              <hr className="nav-sep" />
              {nav('users', Users, 'Kelola akun')}
              {nav('audit', History, 'Riwayat perubahan')}
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <button className="profile-open" title="Profil saya" onClick={() => setProfileModal(true)}>
              <Avatar name={user.name} photo={user.photo} />
              <div><b>{user.name}</b><small>{admin ? 'Admin' : 'Anggota'}</small></div>
            </button>
            <button className="icon-btn profile-action" title="Ubah password" aria-label="Ubah password" onClick={() => setPasswordModal(true)}><KeyRound size={16} /></button>
            <button className="icon-btn profile-action" title="Keluar" aria-label="Keluar" onClick={logout}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      <button
        className="sidebar-toggle"
        onClick={toggleCollapsed}
        title={collapsed ? 'Buka sidebar' : 'Ciutkan sidebar'}
        aria-label={collapsed ? 'Buka sidebar' : 'Ciutkan sidebar'}
        aria-expanded={!collapsed}
      >
        <ChevronLeft size={15} />
      </button>
      {mobile && <button className="sidebar-overlay" aria-label="Tutup menu" onClick={() => setMobile(false)} />}

      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="icon-btn mobile-menu" onClick={() => setMobile(!mobile)} aria-label="Buka navigasi"><Menu size={20} /></button>
            <b>{info.title}</b>
          </div>
          <div className="topbar-right">
            <button className="topbar-avatar" title="Profil saya" aria-label="Profil saya" onClick={() => setProfileModal(true)}>
              <Avatar name={user.name} photo={user.photo} size="small" />
            </button>
          </div>
        </header>

        <main className="page-content">
          {error && <div className="error-banner" role="alert">{error}<button onClick={load}>Coba lagi</button></div>}

          <div className="view-enter" key={view}>
          {['overview', 'apps', 'mine'].includes(view) && (
            <AppsView
              key={view}
              view={view}
              info={info}
              user={user}
              apps={apps}
              users={users}
              profiles={profiles}
              loading={loading}
              filters={filters}
              setFilters={setFilters}
              reload={load}
              notify={notify}
              onNavigate={changeView}
            />
          )}
          {view === 'trash' && <TrashView info={info} user={user} admin={admin} reload={load} notify={notify} />}
          {view === 'users' && <AccountsView info={info} users={users} currentUser={user} reload={load} notify={notify} />}
          {view === 'audit' && <AuditView info={info} notify={notify} />}
          </div>
        </main>
      </div>

      {passwordModal && <PasswordModal close={() => setPasswordModal(false)} notify={notify} />}
      {profileModal && (
        <ProfileModal
          user={user}
          close={() => setProfileModal(false)}
          notify={notify}
          onSaved={saved => {
            onUserChange(saved);
            load();
          }}
        />
      )}
      <Toast toast={toast} />
    </div>
  );
}

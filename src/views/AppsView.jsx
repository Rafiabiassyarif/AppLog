import React, { useMemo, useState } from 'react';
import {
  Plus, Search, Download, ChevronDown, FileSpreadsheet, FileText, List, Grid2X2, Loader2, FolderKanban,
  Eye, ArrowUpRight, Pencil, Trash2, CalendarDays,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { queryApps, SORT_OPTIONS } from '../lib/appQuery.js';
import { STATUSES, TYPE_LABEL, APP_TYPES, initials, techList, blankApp, formatDate, formatPeriod, deadlineInfo, specProgress } from '../lib/format.js';
import { Avatar, Badge, Button, ConfirmModal, PageHeading, Pagination } from '../components.jsx';
import AppModal from './AppModal.jsx';
import DashboardView from './DashboardView.jsx';
import MemberProfileModal from './MemberProfileModal.jsx';

const PAGE_SIZE = 20;

const AppIcon = ({ app, index }) => (app.logo
  ? <img className="app-icon app-logo" src={app.logo} alt="" />
  : <span className={'app-icon color-' + (index % 5)}>{initials(app.name)}</span>);

/** Nama pembuat. Bisa diklik jika profilnya ditemukan. */
function OwnerCell({ app, profile, onOpen }) {
  if (!profile) return <span className="owner-cell"><Avatar name={app.owner} size="tiny" />{app.owner}</span>;
  return (
    <button type="button" className="owner-cell owner-link" onClick={() => onOpen(profile)} title={`Lihat profil ${profile.name}`}>
      <Avatar name={app.owner} photo={profile.photo} size="tiny" /><span>{app.owner}</span>
    </button>
  );
}

/** Tim proyek: tumpukan avatar, tiap avatar membuka profil. Jenis lain memakai OwnerCell. */
function TeamCell({ app, profiles, profile, onOpen }) {
  const team = (app.members || []).map(m => ({ ...m, profile: profiles.find(p => p.id === m.userId) })).filter(m => m.profile);
  if (app.type !== 'project' || !team.length) return <OwnerCell app={app} profile={profile} onOpen={onOpen} />;
  const lead = team.find(m => m.lead) || team[0];
  return (
    <span className="team-cell">
      <span className="team-stack">
        {team.slice(0, 3).map(m => (
          <button type="button" key={m.userId} onClick={() => onOpen(m.profile)} title={`${m.profile.name}${m.lead ? ' (ketua)' : ''}`} aria-label={`Lihat profil ${m.profile.name}`}>
            <Avatar name={m.profile.name} photo={m.profile.photo} size="tiny" />
          </button>
        ))}
        {team.length > 3 && <span className="team-more">+{team.length - 3}</span>}
      </span>
      <small>{lead.profile.name.split(' ')[0]}{team.length > 1 ? ` +${team.length - 1}` : ''}</small>
    </span>
  );
}

/** Info singkat proyek: tenggat dan progres spesifikasi. */
function ProjectMeta({ app }) {
  if (app.type !== 'project') return null;
  const due = deadlineInfo(app);
  const progress = specProgress(app);
  if (!due && !progress.total) return null;
  return (
    <span className="project-meta">
      {due && <span className={'due-tag ' + due.tone}>{due.text}</span>}
      {progress.total > 0 && <span className="spec-mini" title={`Spesifikasi ${progress.done}/${progress.total}`}><i style={{ width: progress.percent + '%' }} /></span>}
    </span>
  );
}

function Actions({ app, editable, deletable, onDetail, onEdit, onDelete }) {
  return (
    <div className="row-actions">
      <button className="icon-btn" title="Detail aplikasi" aria-label={`Detail ${app.name}`} onClick={onDetail}><Eye size={16} /></button>
      {app.link && (
        <a className="icon-btn" href={app.link} target="_blank" rel="noopener noreferrer" title="Buka aplikasi" aria-label={`Buka ${app.name}`}>
          <ArrowUpRight size={17} />
        </a>
      )}
      {editable && (
        <>
          <button className="icon-btn" title="Edit aplikasi" aria-label={`Edit ${app.name}`} onClick={onEdit}><Pencil size={15} /></button>
          {deletable && <button className="icon-btn danger" title="Hapus aplikasi" aria-label={`Hapus ${app.name}`} onClick={onDelete}><Trash2 size={15} /></button>}
        </>
      )}
    </div>
  );
}

export default function AppsView({ view, info, user, apps, users, profiles = [], loading, filters, setFilters, reload, notify, onNavigate }) {
  const admin = user.role === 'admin';
  const [modal, setModal] = useState(null);
  const [member, setMember] = useState(null);
  // Pembuat yang ditampilkan = nama di kolom pembuat. Utamakan akun pembuat jika namanya sama.
  const profileFor = app => {
    const creator = profiles.find(p => p.id === app.createdBy);
    if (creator && creator.name === app.owner) return creator;
    return profiles.find(p => p.name === app.owner) || null;
  };
  const memberApps = member ? apps.filter(app => app.createdBy === member.id || app.owner === member.name || (app.members || []).some(m => m.userId === member.id)) : [];
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);

  const mine = view === 'mine';
  const list = useMemo(
    () => queryApps(apps, { ...filters, createdBy: mine ? user.id : '' }),
    [apps, filters, mine, user.id],
  );
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const visible = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const canManage = app => admin || app.createdBy === user.id;
  const inTeam = app => (app.members || []).some(m => m.userId === user.id);
  const canEdit = app => canManage(app) || inTeam(app);
  const update = changes => setFilters(current => ({ ...current, page: 1, ...changes }));

  async function save(form) {
    setBusy(true);
    try {
      const body = { ...form };
      delete body.readOnly;
      if (form.id) await api(`/api/apps/${form.id}`, { method: 'PUT', body });
      else await api('/api/apps', { method: 'POST', body });
      await reload();
      setModal(null);
      notify('Data aplikasi berhasil disimpan.');
    } finally {
      setBusy(false);
    }
  }

  // Centang spesifikasi langsung dari detail; modal tetap terbuka dengan data terbaru.
  async function toggleSpec(app, spec) {
    try {
      const updated = await api(`/api/apps/${app.id}/specs/${spec.id}`, { method: 'PATCH', body: { done: !spec.done } });
      setModal(current => (current && current.id === app.id ? { ...updated, readOnly: current.readOnly } : current));
      reload();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/apps/${deleting.id}`, { method: 'DELETE' });
      await reload();
      setDeleting(null);
      notify('Aplikasi dipindahkan ke Sampah.');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function download(ext) {
    const params = new URLSearchParams({ q: filters.q, sort: filters.sort });
    if (filters.type !== 'all') params.set('type', filters.type);
    if (filters.status !== 'all') params.set('status', filters.status);
    if (mine) params.set('mine', '1');
    location.href = `/api/export.${ext}?${params}`;
    setExportMenu(false);
  }

  const newApp = () => setModal({ ...blankApp(), owner: user.name });
  const actionProps = app => ({
    app,
    editable: canEdit(app),
    deletable: canManage(app),
    onDetail: () => setModal({ ...app, readOnly: true }),
    onEdit: () => setModal(app),
    onDelete: () => setDeleting(app),
  });

  return (
    <>
      <PageHeading info={info} action={<Button onClick={newApp}><Plus size={17} />Tambah aplikasi</Button>} />

      {view === 'overview' ? (
        <DashboardView
          apps={apps}
          users={users}
          user={user}
          admin={admin}
          loading={loading}
          onNavigate={onNavigate}
          onOpen={(app, edit) => setModal(edit && canEdit(app) ? app : { ...app, readOnly: true })}
        />
      ) : (
        <section className="registry">
          <div className="section-title">
            <div>
              <h2>{mine ? 'Aplikasi saya' : 'Daftar aplikasi'}<span className="count-badge">{list.length}</span></h2>
            </div>
            <div className="export-control">
              <Button secondary onClick={() => setExportMenu(!exportMenu)} aria-expanded={exportMenu}><Download size={15} />Ekspor<ChevronDown size={14} /></Button>
              {exportMenu && (
                <>
                  <button className="menu-backdrop" aria-label="Tutup menu ekspor" onClick={() => setExportMenu(false)} />
                  <div className="export-menu">
                    <button onClick={() => download('xlsx')}><FileSpreadsheet size={17} /><div>Excel (.xlsx)<small>Unduh daftar sesuai filter</small></div></button>
                    <button onClick={() => download('pdf')}><FileText size={17} /><div>Laporan PDF<small>Unduh daftar sesuai filter</small></div></button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="toolbar">
            <label className="search">
              <Search size={17} />
              <input aria-label="Cari aplikasi" placeholder="Cari aplikasi, pembuat, teknologi..." value={filters.q} onChange={e => update({ q: e.target.value })} />
            </label>
            <div className="toolbar-filters">
              <select aria-label="Filter jenis" value={filters.type} onChange={e => update({ type: e.target.value })}>
                <option value="all">Semua jenis</option>
                {APP_TYPES.map(type => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}
              </select>
              <select aria-label="Filter status" value={filters.status} onChange={e => update({ status: e.target.value })}>
                <option value="all">Semua status</option>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
              <select aria-label="Urutkan" value={filters.sort} onChange={e => update({ sort: e.target.value })}>
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div className="view-toggle">
                <button aria-label="Tampilan tabel" aria-pressed={filters.layout === 'table'} className={filters.layout === 'table' ? 'selected' : ''} onClick={() => setFilters(f => ({ ...f, layout: 'table' }))}><List size={17} /></button>
                <button aria-label="Tampilan kartu" aria-pressed={filters.layout === 'grid'} className={filters.layout === 'grid' ? 'selected' : ''} onClick={() => setFilters(f => ({ ...f, layout: 'grid' }))}><Grid2X2 size={16} /></button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="empty-state"><Loader2 className="spin" /><p>Memuat aplikasi...</p></div>
          ) : !list.length ? (
            <div className="empty-state">
              <span className="empty-icon"><FolderKanban size={30} /></span>
              <h3>{apps.length ? 'Tidak ada hasil.' : 'Belum ada aplikasi.'}</h3>
              
              <Button secondary onClick={newApp}><Plus size={16} />Tambah aplikasi</Button>
            </div>
          ) : filters.layout === 'table' ? (
            <div className="table-scroll">
              <table className="apps-table">
                <thead><tr><th>NAMA APLIKASI</th><th>JENIS</th><th>STATUS</th><th>PEMBUAT</th><th>MULAI</th><th>TEKNOLOGI</th><th>AKSI</th></tr></thead>
                <tbody>
                  {visible.map((app, i) => (
                    <tr key={app.id}>
                      <td><div className="app-name"><AppIcon app={app} index={i} /><div><b>{app.name}</b><small>{app.description || 'Belum ada deskripsi'}</small></div></div></td>
                      <td><span className={'type-tag ' + app.type}>{TYPE_LABEL[app.type]}</span><ProjectMeta app={app} /></td>
                      <td><Badge status={app.status} /></td>
                      <td><TeamCell app={app} profiles={profiles} profile={profileFor(app)} onOpen={setMember} /></td>
                      <td className="date-cell">{formatDate(app.startDate) || app.year || '—'}</td>
                      <td><div className="tech-tags">{techList(app.tech).length ? techList(app.tech).slice(0, 2).map(t => <span key={t}>{t}</span>) : <span>—</span>}</div></td>
                      <td><Actions {...actionProps(app)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="app-grid">
              {visible.map((app, i) => (
                <article className="app-card" key={app.id}>
                  <div className="card-top"><AppIcon app={app} index={i} /><Badge status={app.status} /></div>
                  <span className={'type-tag ' + app.type}>{TYPE_LABEL[app.type]}</span>
                  <h3>{app.name}</h3>
                  <p>{app.description || 'Belum ada deskripsi.'}</p>
                  <div className="tech-tags">{techList(app.tech).map(t => <span key={t}>{t}</span>)}</div>
                  <ProjectMeta app={app} />
                  {formatPeriod(app) && <span className="card-date"><CalendarDays size={13} />{formatPeriod(app)}</span>}
                  <footer>
                    <TeamCell app={app} profiles={profiles} profile={profileFor(app)} onOpen={setMember} />
                    <Actions {...actionProps(app)} />
                  </footer>
                </article>
              ))}
            </div>
          )}

          <Pagination page={page} pageCount={pageCount} onChange={next => setFilters(f => ({ ...f, page: next }))} />
        </section>
      )}

      {member && (
        <MemberProfileModal
          profile={member}
          apps={memberApps}
          isSelf={member.id === user.id}
          close={() => setMember(null)}
          onOpenApp={app => { setMember(null); setModal({ ...app, readOnly: true }); }}
        />
      )}
      {modal && (
        <AppModal
          key={`${modal.id || 'new'}-${modal.updatedAt || ''}-${modal.readOnly ? 'r' : 'w'}`}
          app={modal}
          admin={admin}
          user={user}
          profiles={profiles}
          manage={!modal.id || canManage(modal)}
          canWork={!modal.id || canEdit(modal)}
          busy={busy}
          save={save}
          onToggleSpec={spec => toggleSpec(modal, spec)}
          onEdit={() => setModal({ ...modal, readOnly: false })}
          onOpenProfile={profile => { setModal(null); setMember(profile); }}
          close={() => setModal(null)}
        />
      )}
      {deleting && (
        <ConfirmModal
          title="Hapus aplikasi?"
          subtitle="Aplikasi dipindahkan ke Sampah dan masih bisa dipulihkan."
          message={<>Kamu akan menghapus <b>{deleting.name}</b> dari daftar aplikasi.</>}
          confirmLabel="Ya, pindahkan ke Sampah"
          busy={busy}
          onConfirm={remove}
          close={() => setDeleting(null)}
        />
      )}
    </>
  );
}

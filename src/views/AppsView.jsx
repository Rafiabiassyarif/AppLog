import React, { useMemo, useState } from 'react';
import {
  Plus, Search, Download, ChevronDown, FileSpreadsheet, FileText, List, Grid2X2, Loader2, FolderKanban,
  Layers, Clock3, CheckCircle2, Users, UserRound, Eye, ArrowUpRight, Pencil, Trash2,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { queryApps, SORT_OPTIONS } from '../lib/appQuery.js';
import { STATUSES, TYPE_LABEL, initials, techList, blankApp } from '../lib/format.js';
import { Avatar, Badge, Button, ConfirmModal, PageHeading, Pagination } from '../components.jsx';
import AppModal from './AppModal.jsx';

const PAGE_SIZE = 20;

function Stat({ label, value, icon: Icon, tone }) {
  return (
    <article className="stat-card">
      <div className="stat-head"><span>{label}</span><span className={'stat-icon ' + tone}><Icon size={18} /></span></div>
      <strong>{value}</strong>
      
    </article>
  );
}

const AppIcon = ({ name, index }) => <span className={'app-icon color-' + (index % 5)}>{initials(name)}</span>;

function Actions({ app, editable, onDetail, onEdit, onDelete }) {
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
          <button className="icon-btn danger" title="Hapus aplikasi" aria-label={`Hapus ${app.name}`} onClick={onDelete}><Trash2 size={15} /></button>
        </>
      )}
    </div>
  );
}

export default function AppsView({ view, info, user, apps, users, loading, filters, setFilters, reload, notify }) {
  const admin = user.role === 'admin';
  const [modal, setModal] = useState(null);
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
  const canEdit = app => admin || app.createdBy === user.id;
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
    onDetail: () => setModal({ ...app, readOnly: true }),
    onEdit: () => setModal(app),
    onDelete: () => setDeleting(app),
  });

  return (
    <>
      <PageHeading info={info} action={<Button onClick={newApp}><Plus size={17} />Tambah aplikasi</Button>} />

      {view === 'overview' && (
        <>
          <section className="stats-grid">
            <Stat label="Total aplikasi" value={apps.length} icon={Layers} tone="lime" />
            <Stat label="Dikerjakan" value={apps.filter(a => a.status === 'Dikerjakan').length} icon={Clock3} tone="orange" />
            <Stat label="Selesai" value={apps.filter(a => a.status === 'Selesai').length} icon={CheckCircle2} tone="green" />
            {admin
              ? <Stat label="Anggota" value={users.length} icon={Users} tone="purple" />
              : <Stat label="Aplikasi saya" value={apps.filter(a => a.createdBy === user.id).length} icon={UserRound} tone="purple" />}
          </section>
        </>
      )}

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
              <option value="internal">Internal</option>
              <option value="personal">Personal</option>
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
              <thead><tr><th>NAMA APLIKASI</th><th>JENIS</th><th>STATUS</th><th>PEMBUAT</th><th>TEKNOLOGI</th><th>AKSI</th></tr></thead>
              <tbody>
                {visible.map((app, i) => (
                  <tr key={app.id}>
                    <td><div className="app-name"><AppIcon name={app.name} index={i} /><div><b>{app.name}</b><small>{app.description || 'Belum ada deskripsi'}</small></div></div></td>
                    <td><span className={'type-tag ' + app.type}>{TYPE_LABEL[app.type]}</span></td>
                    <td><Badge status={app.status} /></td>
                    <td><span className="owner-cell"><Avatar name={app.owner} size="tiny" />{app.owner}</span></td>
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
                <div className="card-top"><AppIcon name={app.name} index={i} /><Badge status={app.status} /></div>
                <span className={'type-tag ' + app.type}>{TYPE_LABEL[app.type]}</span>
                <h3>{app.name}</h3>
                <p>{app.description || 'Belum ada deskripsi.'}</p>
                <div className="tech-tags">{techList(app.tech).map(t => <span key={t}>{t}</span>)}</div>
                <footer>
                  <span className="owner-cell"><Avatar name={app.owner} size="tiny" />{app.owner}</span>
                  <Actions {...actionProps(app)} />
                </footer>
              </article>
            ))}
          </div>
        )}

        <Pagination page={page} pageCount={pageCount} onChange={next => setFilters(f => ({ ...f, page: next }))} />
      </section>

      {modal && <AppModal app={modal} admin={admin} user={user} busy={busy} save={save} close={() => setModal(null)} />}
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

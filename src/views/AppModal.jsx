import React, { useRef, useState } from 'react';
import { Check, Crown, ImagePlus, ListChecks, Loader2, Pencil, Plus, Trash2, UsersRound, X } from 'lucide-react';
import { Avatar, Button, Modal } from '../components.jsx';
import { APP_TYPES, LIMITS, STATUSES, TYPE_LABEL, deadlineInfo, formatDate, formatDateTime, initials, specProgress } from '../lib/format.js';
import { logoFromFile } from '../lib/logo.js';

/**
 * Form dan detail aplikasi.
 * manage: boleh mengubah data (Admin atau pembuat).
 * canWork: anggota tim proyek, hanya bagian kerja (status, teknologi, link, deskripsi, tanggal, logo) dan centang spesifikasi.
 * Proyek buatan User dikerjakan sendiri: hanya pemberi dan tenggat. Tim dan spesifikasi hanya diatur Admin.
 */
export default function AppModal({ app, admin, user, profiles = [], manage = true, canWork = true, busy, save, close, onToggleSpec, onEdit, onOpenProfile }) {
  const readonly = Boolean(app.readOnly);
  const locked = readonly || !manage;
  const workLocked = readonly || !(manage || canWork);
  const [form, setForm] = useState({
    ...app,
    owner: readonly || admin ? app.owner : app.owner || user.name,
    members: app.members || [],
    specs: app.specs || [],
  });
  const [error, setError] = useState('');
  const [specDraft, setSpecDraft] = useState('');
  const field = (key, disabled = locked) => ({
    value: form[key] || '',
    onChange: event => setForm({ ...form, [key]: event.target.value }),
    disabled,
  });
  const project = form.type === 'project';
  // Tim dan spesifikasi: diatur Admin. User hanya melihatnya bila proyek ini memang punya tim atau spesifikasi.
  const teamLocked = locked || !admin;
  const showTeam = project && (admin || form.members.length > 0);
  const showSpecs = project && (admin || form.specs.length > 0);

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

  function changeType(type) {
    // Proyek baru dari Admin: pembuatnya otomatis masuk tim sebagai ketua.
    const members = admin && type === 'project' && !form.members.length && !app.id ? [{ userId: user.id, lead: true }] : form.members;
    setForm({ ...form, type, members });
  }

  // ----- Tim -----
  const profileOf = id => profiles.find(p => p.id === id);
  const candidates = profiles.filter(p => p.active && !form.members.some(m => m.userId === p.id));
  const addMember = id => id && setForm({ ...form, members: [...form.members, { userId: id, lead: !form.members.length }] });
  const removeMember = id => {
    const members = form.members.filter(m => m.userId !== id);
    if (members.length && !members.some(m => m.lead)) members[0] = { ...members[0], lead: true };
    setForm({ ...form, members });
  };
  const makeLead = id => setForm({ ...form, members: form.members.map(m => ({ ...m, lead: m.userId === id })) });

  // ----- Spesifikasi -----
  function addSpec() {
    const text = specDraft.trim();
    if (!text) return;
    if (form.specs.length >= LIMITS.specs) return setError(`Spesifikasi maksimal ${LIMITS.specs} poin.`);
    setForm({ ...form, specs: [...form.specs, { text, done: false }] });
    setSpecDraft('');
  }
  const updateSpec = (index, changes) => setForm({ ...form, specs: form.specs.map((s, i) => (i === index ? { ...s, ...changes } : s)) });
  const removeSpec = index => setForm({ ...form, specs: form.specs.filter((_, i) => i !== index) });
  function tick(spec, index) {
    if (readonly) return onToggleSpec?.(spec);
    updateSpec(index, { done: !spec.done });
  }

  async function submit(event) {
    event.preventDefault();
    try {
      setError('');
      const body = {
        ...form,
        members: form.members.map(m => m.userId),
        leadId: (form.members.find(m => m.lead) || {}).userId || '',
        specs: form.specs.map(({ id, text, done }) => ({ id, text, done })),
      };
      await save(body);
    } catch (e) {
      setError(e.message);
    }
  }

  const progress = specProgress(form);
  const due = deadlineInfo(form);
  const canTick = readonly ? canWork && Boolean(app.id) : true;

  return (
    <Modal
      title={readonly ? (project ? 'Detail proyek' : 'Detail aplikasi') : app.id ? (project ? 'Edit proyek' : 'Edit aplikasi') : 'Tambah aplikasi'}
      close={close}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="full logo-row">
            <button
              type="button"
              className={'logo-picker' + (form.logo ? ' has-logo' : '')}
              onClick={() => fileInput.current.click()}
              disabled={workLocked}
              aria-label={form.logo ? 'Ganti logo' : 'Unggah logo'}
              title={workLocked ? undefined : form.logo ? 'Ganti logo' : 'Unggah logo'}
            >
              {form.logo ? <img src={form.logo} alt="Logo aplikasi" /> : <span>{initials(form.name)}</span>}
              {!workLocked && <span className="logo-overlay"><ImagePlus size={18} /></span>}
            </button>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickLogo} />
            <label className="logo-name">Nama aplikasi <b>*</b>
              <input {...field('name')} required maxLength={LIMITS.name} placeholder="Contoh: Inventory Management" />
            </label>
            {!workLocked && (
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
          {!readonly && !manage && (
            <p className="full team-note"><UsersRound size={15} />Kamu anggota tim proyek ini. Isi bagian kerjamu: status, tanggal, teknologi, link, deskripsi, logo, dan centang spesifikasi. Nama, pemberi, tenggat, tim, dan isi spesifikasi diatur Admin.</p>
          )}
          <label>Jenis aplikasi
            <select value={form.type} onChange={e => changeType(e.target.value)} disabled={locked}>
              {APP_TYPES.map(type => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}
            </select>
          </label>
          <label>Status
            <select {...field('status', readonly)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
          </label>

          {project && (
            <>
              <label>Pemberi proyek
                <input {...field('client')} maxLength={LIMITS.client} placeholder="Contoh: Dosen Pemrograman Web" />
              </label>
              <label>Tenggat
                <input {...field('deadline')} type="date" min="2000-01-01" max="2100-12-31" />
                {due && <small className={'due-text ' + due.tone}>{due.text}</small>}
              </label>
            </>
          )}

          <label>Mulai dikerjakan
            <input {...field('startDate', workLocked)} type="date" min="2000-01-01" max="2100-12-31" />
            {!form.startDate && form.year && <small>Data lama: tahun {form.year}.</small>}
          </label>
          <label>Selesai dikerjakan
            <input {...field('endDate', workLocked)} type="date" min={form.startDate || '2000-01-01'} max="2100-12-31" />
            {!workLocked && !form.endDate && <small>Kosongkan bila masih berjalan.</small>}
          </label>
          <label>Pembuat <b>*</b>
            <input {...field('owner')} readOnly={!admin} required maxLength={LIMITS.owner} />
          </label>
          <label>Teknologi
            <input {...field('tech', readonly)} placeholder="React, Node.js, PostgreSQL" maxLength={LIMITS.tech} />
            <small>Pisahkan dengan koma.</small>
          </label>
          <label className="full">Link aplikasi atau repository
            <input {...field('link', readonly)} type="url" maxLength={LIMITS.link} placeholder="https://..." />
          </label>
          <label className="full">Deskripsi
            <textarea {...field('description', workLocked)} maxLength={LIMITS.description} rows={3} placeholder="Jelaskan singkat fungsi aplikasi ini." />
            {!workLocked && <small className="counter">{(form.description || '').length}/{LIMITS.description} karakter</small>}
          </label>

          {project && !admin && manage && !readonly && !showTeam && (
            <p className="full team-note"><UsersRound size={15} />Proyek yang kamu kerjakan sendiri. Proyek dengan tim dan spesifikasi dibuat oleh Admin.</p>
          )}

          {showTeam && (
            <section className="full project-box">
              <header>
                <span className="project-box-icon"><UsersRound size={16} /></span>
                <div><h4>Tim proyek</h4><p>{form.members.length ? `${form.members.length} orang` : 'Belum ada anggota.'}</p></div>
              </header>
              {form.members.length > 0 && (
                <ul className="team-list">
                  {form.members.map(m => {
                    const p = profileOf(m.userId);
                    const name = p ? p.name : 'Akun tidak ditemukan';
                    return (
                      <li key={m.userId} className={m.lead ? 'lead' : ''}>
                        <button type="button" className="team-person" onClick={() => p && readonly && onOpenProfile?.(p)} disabled={!p || !readonly} title={p && readonly ? `Lihat profil ${name}` : undefined}>
                          <Avatar name={name} photo={p?.photo} size="tiny" />
                          <span>{name}{m.userId === user.id && <em> (kamu)</em>}</span>
                        </button>
                        {m.lead
                          ? <span className="lead-tag"><Crown size={12} />Ketua</span>
                          : !teamLocked && <button type="button" className="chip-btn" onClick={() => makeLead(m.userId)} title="Jadikan ketua"><Crown size={12} />Jadikan ketua</button>}
                        {!teamLocked && <button type="button" className="icon-btn danger" onClick={() => removeMember(m.userId)} aria-label={`Keluarkan ${name}`} title="Keluarkan"><X size={14} /></button>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {!teamLocked && (
                <select className="team-add" value="" onChange={e => addMember(e.target.value)} aria-label="Tambah anggota tim" disabled={!candidates.length}>
                  <option value="">{candidates.length ? '+ Tambah anggota tim…' : 'Semua akun sudah masuk tim'}</option>
                  {candidates.map(p => <option key={p.id} value={p.id}>{p.name} (@{p.username})</option>)}
                </select>
              )}
            </section>
          )}

          {showSpecs && (
            <section className="full project-box">
              <header>
                <span className="project-box-icon"><ListChecks size={16} /></span>
                <div><h4>Spesifikasi</h4><p>{progress.total ? `${progress.done} dari ${progress.total} selesai` : 'Daftar fitur atau kebutuhan proyek.'}</p></div>
                {progress.total > 0 && <strong className="spec-percent">{progress.percent}%</strong>}
              </header>
              {progress.total > 0 && <div className="spec-bar"><span style={{ width: progress.percent + '%' }} /></div>}
              {form.specs.length > 0 && (
                <ul className="spec-list">
                  {form.specs.map((spec, i) => (
                    <li key={spec.id || 'new-' + i} className={spec.done ? 'done' : ''}>
                      <button type="button" className="spec-check" onClick={() => tick(spec, i)} disabled={!canTick || (readonly && busy)} aria-pressed={spec.done} aria-label={`${spec.done ? 'Batal selesai' : 'Tandai selesai'}: ${spec.text}`}>
                        {spec.done && <Check size={13} />}
                      </button>
                      {teamLocked
                        ? <span className="spec-text">{spec.text}</span>
                        : <input className="spec-input" value={spec.text} maxLength={LIMITS.spec} onChange={e => updateSpec(i, { text: e.target.value })} aria-label={`Poin spesifikasi ${i + 1}`} />}
                      {!teamLocked && <button type="button" className="icon-btn danger" onClick={() => removeSpec(i)} aria-label={`Hapus poin ${i + 1}`} title="Hapus poin"><X size={14} /></button>}
                    </li>
                  ))}
                </ul>
              )}
              {!teamLocked && (
                <div className="spec-add">
                  <input
                    value={specDraft}
                    maxLength={LIMITS.spec}
                    placeholder="Contoh: Login dengan NIM"
                    onChange={e => setSpecDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSpec(); } }}
                    aria-label="Poin spesifikasi baru"
                  />
                  <Button secondary type="button" onClick={addSpec} disabled={!specDraft.trim()}><Plus size={15} />Tambah poin</Button>
                </div>
              )}
              {readonly && canTick && progress.total > 0 && <small className="spec-hint">Klik kotak untuk menandai poin selesai.</small>}
            </section>
          )}
        </div>
        {readonly && project && form.deadline && <p className="muted meta-line">Tenggat {formatDate(form.deadline)}</p>}
        {readonly && app.updatedAt && <p className="muted meta-line">Terakhir diperbarui {formatDateTime(app.updatedAt)}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-footer">
          <Button secondary type="button" onClick={close} disabled={busy}>{readonly ? 'Tutup' : 'Batal'}</Button>
          {readonly && canWork && app.id && onEdit && <Button type="button" onClick={onEdit}><Pencil size={15} />Edit</Button>}
          {!readonly && <Button disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}Simpan aplikasi</Button>}
        </div>
      </form>
    </Modal>
  );
}

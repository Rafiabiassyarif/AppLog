import React from 'react';
import { AtSign, ChevronRight, FolderKanban, ShieldCheck, UserRound } from 'lucide-react';
import { STATUSES, TYPE_LABEL, initials, formatPeriod } from '../lib/format.js';
import { Avatar, Badge, Button, Modal } from '../components.jsx';

const STATUS_COLOR = { Ide: '#7b61d1', Dikerjakan: '#e3901f', Selesai: '#22915c', Maintenance: '#3a6fc4' };

/** Profil anggota tim (pembuat aplikasi): foto, bio, ringkasan status, dan daftar aplikasinya. */
export default function MemberProfileModal({ profile, apps, isSelf, close, onOpenApp }) {
  const counts = Object.fromEntries(STATUSES.map(status => [status, apps.filter(app => app.status === status).length]));
  const sorted = [...apps].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const admin = profile.role === 'admin';

  return (
    <Modal title="Profil anggota" close={close}>
      <div className="member-profile">
        <div className="member-hero">
          <span className="member-hero-orb" />
          <div className="member-photo"><Avatar name={profile.name} photo={profile.photo} size="xl" /></div>
          <div className="member-id">
            <h3>{profile.name}{isSelf && <span className="member-self">Kamu</span>}</h3>
            <p>
              <span><AtSign size={13} />{profile.username}</span>
              <span className={'member-role' + (admin ? ' admin' : '')}>
                {admin ? <ShieldCheck size={13} /> : <UserRound size={13} />}{admin ? 'Admin' : 'Anggota'}
              </span>
              {!profile.active && <span className="member-role off">Nonaktif</span>}
            </p>
          </div>
        </div>

        <section className="member-section">
          <h4>Bio</h4>
          {profile.bio
            ? <p className="member-bio">{profile.bio}</p>
            : <p className="member-bio empty">{isSelf ? 'Kamu belum menulis bio. Tambahkan lewat Profil saya.' : 'Belum menulis bio.'}</p>}
        </section>

        <section className="member-stats" aria-label="Ringkasan aplikasi">
          <div className="member-stat total">
            <FolderKanban size={16} />
            <strong>{apps.length}</strong>
            <small>Aplikasi</small>
          </div>
          {STATUSES.map(status => (
            <div className="member-stat" key={status} style={{ '--tone': STATUS_COLOR[status] }}>
              <i />
              <strong>{counts[status]}</strong>
              <small>{status}</small>
            </div>
          ))}
        </section>

        <section className="member-section">
          <h4>Aplikasi {profile.name.split(' ')[0]}</h4>
          {sorted.length ? (
            <ul className="member-apps">
              {sorted.map((app, i) => (
                <li key={app.id} style={{ '--delay': `${Math.min(i, 8) * 0.04}s` }}>
                  <button type="button" onClick={() => onOpenApp(app)} title={`Lihat detail ${app.name}`}>
                    {app.logo
                      ? <img className="app-icon app-logo" src={app.logo} alt="" />
                      : <span className={'app-icon color-' + (i % 5)}>{initials(app.name)}</span>}
                    <span className="member-app-name">
                      <b>{app.name}</b>
                      <small>{TYPE_LABEL[app.type]}{formatPeriod(app) ? ` · ${formatPeriod(app)}` : ''}</small>
                    </span>
                    <Badge status={app.status} />
                    <ChevronRight size={16} className="member-app-go" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="member-bio empty">Belum ada aplikasi.</p>
          )}
        </section>
      </div>
      <div className="modal-footer">
        <Button secondary type="button" onClick={close}>Tutup</Button>
      </div>
    </Modal>
  );
}

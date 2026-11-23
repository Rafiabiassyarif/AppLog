import React, { useMemo } from 'react';
import {
  Layers, Clock3, CheckCircle2, Lightbulb, Wrench, UserRound, ChartPie, ChartColumn, Code2, Activity, Trophy, ListChecks, ArrowRight, Sparkles, Loader2,
} from 'lucide-react';
import { STATUSES, TYPE_LABEL, APP_TYPES, initials, techList, timeAgo } from '../lib/format.js';
import { useCountUp, useMounted } from '../lib/useCountUp.js';
import { Avatar, Badge } from '../components.jsx';

const STATUS_COLOR = { Ide: '#7b61d1', Dikerjakan: '#e3901f', Selesai: '#22915c', Maintenance: '#3a6fc4' };
const STATUS_ICON = { Ide: Lightbulb, Dikerjakan: Clock3, Selesai: CheckCircle2, Maintenance: Wrench };
const STATUS_TONE = { Ide: 'purple', Dikerjakan: 'orange', Selesai: 'green', Maintenance: 'blue' };
const TYPE_COLOR = { internal: '#133c7e', personal: '#8f6fe0', project: '#16a3a3' };
const MONTHS = 6;

function greeting(hour = new Date().getHours()) {
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 19) return 'Selamat sore';
  return 'Selamat malam';
}

const percent = (part, total) => (total ? Math.round((part / total) * 100) : 0);

/** Jumlah aplikasi yang mulai dikerjakan per bulan, beberapa bulan terakhir. */
function monthlyStarts(apps, now = new Date()) {
  const months = Array.from({ length: MONTHS }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1);
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, label: date.toLocaleDateString('id-ID', { month: 'short' }), count: 0 };
  });
  const byKey = Object.fromEntries(months.map(m => [m.key, m]));
  for (const app of apps) {
    const month = app.startDate && byKey[app.startDate.slice(0, 7)];
    if (month) month.count++;
  }
  return months;
}

function topCounts(values, limit) {
  const counts = new Map();
  for (const value of values) {
    const key = value.toLowerCase();
    const item = counts.get(key) || { label: value, count: 0 };
    item.count++;
    counts.set(key, item);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, limit);
}

/** Bagian aplikasi yang datanya belum lengkap, untuk dilengkapi pemiliknya. */
function missingInfo(app) {
  const missing = [];
  if (!app.description) missing.push('deskripsi');
  if (!app.link) missing.push('tautan');
  if (!app.logo) missing.push('logo');
  if (!techList(app.tech).length) missing.push('teknologi');
  return missing;
}

const AppIcon = ({ app, index }) => (app.logo
  ? <img className="app-icon app-logo" src={app.logo} alt="" />
  : <span className={'app-icon color-' + (index % 5)}>{initials(app.name)}</span>);

function Panel({ icon: Icon, title, hint, action, className = '', children }) {
  return (
    <section className={'dash-panel ' + className}>
      <header className="dash-panel-head">
        <span className="dash-panel-icon"><Icon size={17} /></span>
        <div><h2>{title}</h2>{hint && <p>{hint}</p>}</div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, note, icon: Icon, tone, onClick }) {
  const shown = useCountUp(value);
  return (
    <button type="button" className="stat-card stat-link" onClick={onClick} title={`Lihat aplikasi: ${label}`}>
      <div className="stat-head"><span>{label}</span><span className={'stat-icon ' + tone}><Icon size={18} /></span></div>
      <strong>{shown}</strong>
      {note && <small className="stat-note">{note}</small>}
      <ArrowRight size={15} className="stat-go" aria-hidden="true" />
    </button>
  );
}

function Hero({ user, admin, scope, teamTotal, memberCount }) {
  const mounted = useMounted();
  const done = scope.filter(a => a.status === 'Selesai').length;
  // Semua status ikut disebut (yang jumlahnya nol dilewati).
  const parts = STATUSES.map(status => [status, scope.filter(a => a.status === status).length]).filter(([, n]) => n);
  const breakdown = parts.map(([status, n]) => `${n} ${status.toLowerCase()}`);
  const statusText = breakdown.length > 1 ? `${breakdown.slice(0, -1).join(', ')}, dan ${breakdown.at(-1)}` : breakdown[0];
  const rate = percent(done, scope.length);
  const shownRate = useCountUp(rate, 1100);
  const firstName = user.name.split(/\s+/)[0];
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const radius = 44;
  const circle = 2 * Math.PI * radius;

  let summary;
  if (!scope.length) summary = admin ? 'Belum ada aplikasi di workspace. Mulai dengan menambah aplikasi pertama.' : 'Kamu belum punya aplikasi. Tambahkan aplikasi pertamamu agar tim bisa melihatnya.';
  else if (admin) summary = `Tim punya ${scope.length} aplikasi dari ${memberCount} akun: ${statusText}.`;
  else summary = `Kamu punya ${scope.length} dari ${teamTotal} aplikasi tim: ${statusText}.`;

  return (
    <section className="dash-hero">
      <span className="dash-hero-orb one" aria-hidden="true" />
      <span className="dash-hero-orb two" aria-hidden="true" />
      <div className="dash-hero-text">
        <span className="dash-hero-date"><Sparkles size={14} />{today}</span>
        <h2>{greeting()}, {firstName}!</h2>
        <p>{summary}</p>
        {parts.length > 0 && (
          <div className="dash-hero-chips">
            {parts.map(([status, n]) => (
              <span key={status}><i style={{ background: STATUS_COLOR[status] }} />{status}<b>{n}</b></span>
            ))}
          </div>
        )}
      </div>
      <div className="dash-ring" role="img" aria-label={`${rate}% aplikasi selesai`}>
        <svg viewBox="0 0 100 100">
          <circle className="dash-ring-track" cx="50" cy="50" r={radius} />
          <circle className="dash-ring-value" cx="50" cy="50" r={radius} strokeDasharray={circle} strokeDashoffset={mounted ? circle * (1 - rate / 100) : circle} />
        </svg>
        <div><strong>{shownRate}%</strong><small>selesai</small></div>
      </div>
    </section>
  );
}

function StatusDonut({ scope }) {
  const mounted = useMounted();
  const total = scope.length;
  const shownTotal = useCountUp(total);
  const radius = 38;
  const circle = 2 * Math.PI * radius;
  const gap = total > 1 ? 2 : 0;
  let offset = 0;
  const segments = STATUSES.map(status => {
    const count = scope.filter(a => a.status === status).length;
    const length = total ? (count / total) * circle : 0;
    const segment = { status, count, length, offset };
    offset += length;
    return segment;
  });

  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="donut-track" cx="50" cy="50" r={radius} />
          {segments.filter(s => s.count).map((s, i) => (
            <circle
              key={s.status}
              className="donut-segment"
              cx="50" cy="50" r={radius}
              stroke={STATUS_COLOR[s.status]}
              strokeDasharray={`${mounted ? Math.max(0, s.length - gap) : 0} ${circle}`}
              strokeDashoffset={-s.offset}
              style={{ transitionDelay: `${0.15 + i * 0.12}s` }}
            />
          ))}
        </svg>
        <div><strong>{shownTotal}</strong><small>aplikasi</small></div>
      </div>
      <ul className="legend">
        {segments.map((s, i) => (
          <li key={s.status} style={{ '--delay': `${0.2 + i * 0.07}s` }}>
            <span className="legend-dot" style={{ background: STATUS_COLOR[s.status] }} />
            <span className="legend-label">{s.status}</span>
            <b>{s.count}</b>
            <span className="legend-percent">{percent(s.count, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TypeSplit({ scope }) {
  const mounted = useMounted();
  const total = scope.length;
  const types = APP_TYPES.map(type => ({ type, count: scope.filter(a => a.type === type).length }));
  return (
    <div className="type-split">
      <div className="type-bar" aria-hidden="true">
        {types.map((t, i) => (
          <span key={t.type} style={{ width: mounted ? `${percent(t.count, total)}%` : 0, background: TYPE_COLOR[t.type], transitionDelay: `${0.2 + i * 0.1}s` }} />
        ))}
      </div>
      <div className="type-numbers">
        {types.map(t => (
          <div key={t.type}>
            <span><i style={{ background: TYPE_COLOR[t.type] }} />{TYPE_LABEL[t.type]}</span>
            <strong>{t.count}</strong>
            <small>{percent(t.count, total)}% dari total</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthlyChart({ scope }) {
  const mounted = useMounted();
  const months = useMemo(() => monthlyStarts(scope), [scope]);
  const max = Math.max(1, ...months.map(m => m.count));
  const total = months.reduce((sum, m) => sum + m.count, 0);
  return (
    <>
      <div className="columns" role="img" aria-label={`${total} aplikasi mulai dikerjakan dalam ${MONTHS} bulan terakhir`}>
        {months.map((m, i) => (
          <div className="column" key={m.key} title={`${m.label}: ${m.count} aplikasi`}>
            <div className="column-track">
              <span className={'column-bar' + (i === months.length - 1 ? ' current' : '')} style={{ height: mounted ? `${Math.max(m.count ? 8 : 0, (m.count / max) * 100)}%` : 0, transitionDelay: `${0.1 + i * 0.07}s` }}>
                {m.count > 0 && <b>{m.count}</b>}
              </span>
            </div>
            <small>{m.label}</small>
          </div>
        ))}
      </div>
      {!total && <p className="dash-empty-line">Belum ada aplikasi yang mulai dikerjakan {MONTHS} bulan terakhir.</p>}
    </>
  );
}

function RankBars({ items, empty, avatar = false, photos = {} }) {
  const mounted = useMounted();
  if (!items.length) return <p className="dash-empty-line">{empty}</p>;
  const max = items[0].count;
  return (
    <ol className="rank-list">
      {items.map((item, i) => (
        <li key={item.label} style={{ '--delay': `${0.15 + i * 0.06}s` }}>
          <div className="rank-label">
            {avatar ? <Avatar name={item.label} photo={photos[item.label]} size="tiny" /> : <span className="rank-num">{i + 1}</span>}
            <span>{item.label}</span>
            <b>{item.count}</b>
          </div>
          <div className="rank-track"><span style={{ width: mounted ? `${(item.count / max) * 100}%` : 0, transitionDelay: `${0.2 + i * 0.07}s` }} /></div>
        </li>
      ))}
    </ol>
  );
}

export default function DashboardView({ apps, users, user, admin, loading, onOpen, onNavigate }) {
  const scope = useMemo(() => (admin ? apps : apps.filter(a => a.createdBy === user.id || (a.members || []).some(m => m.userId === user.id))), [admin, apps, user.id]);

  if (loading) return <div className="empty-state"><Loader2 className="spin" /><p>Memuat ringkasan...</p></div>;

  const count = status => scope.filter(a => a.status === status).length;
  const recent = [...scope].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 5);
  const techs = topCounts(scope.flatMap(a => techList(a.tech)), 6);
  const owners = topCounts(apps.map(a => a.owner).filter(Boolean), 5);
  const incomplete = scope.map(app => ({ app, missing: missingInfo(app) })).filter(x => x.missing.length).slice(0, 5);
  const listView = admin ? 'apps' : 'mine';
  const seeAll = <button className="dash-link" onClick={() => onNavigate(listView)}>Lihat semua<ArrowRight size={14} /></button>;

  return (
    <div className="dashboard">
      <Hero user={user} admin={admin} scope={scope} teamTotal={apps.length} memberCount={users.length} />

      <section className="stats-grid dash-stats">
        {admin
          ? <Stat label="Total aplikasi" value={scope.length} note={`${users.filter(u => u.active !== false).length} akun aktif`} icon={Layers} tone="lime" onClick={() => onNavigate(listView)} />
          : <Stat label="Aplikasi saya" value={scope.length} note={`dari ${apps.length} aplikasi tim`} icon={UserRound} tone="lime" onClick={() => onNavigate(listView)} />}
        {STATUSES.map(status => (
          <Stat
            key={status}
            label={status}
            value={count(status)}
            note={`${percent(count(status), scope.length)}% dari ${admin ? 'semua aplikasi' : 'aplikasimu'}`}
            icon={STATUS_ICON[status]}
            tone={STATUS_TONE[status]}
            onClick={() => onNavigate(listView, { status })}
          />
        ))}
      </section>

      <div className="dash-grid">
        <Panel icon={ChartPie} title="Status aplikasi" hint={admin ? 'Semua aplikasi tim' : 'Aplikasi milikmu'} className="span-7">
          <StatusDonut scope={scope} />
        </Panel>
        <Panel icon={Layers} title="Jenis aplikasi" hint="Internal, personal, dan proyek" className="span-5">
          <TypeSplit scope={scope} />
        </Panel>

        <Panel icon={ChartColumn} title="Mulai dikerjakan" hint={`${MONTHS} bulan terakhir`} className="span-7">
          <MonthlyChart scope={scope} />
        </Panel>
        <Panel icon={Code2} title="Teknologi terbanyak" hint="Paling sering dipakai" className="span-5">
          <RankBars items={techs} empty="Belum ada teknologi yang dicatat." />
        </Panel>

        <Panel icon={Activity} title="Baru diperbarui" hint={admin ? 'Perubahan terakhir di tim' : 'Perubahan terakhir di aplikasimu'} action={scope.length > 0 && seeAll} className="span-7">
          {recent.length ? (
            <ul className="recent-list">
              {recent.map((app, i) => (
                <li key={app.id} style={{ '--delay': `${0.15 + i * 0.06}s` }}>
                  <button onClick={() => onOpen(app)}>
                    <AppIcon app={app} index={i} />
                    <span className="recent-name"><b>{app.name}</b><small>{admin ? app.owner + ' · ' : ''}{timeAgo(app.updatedAt)}</small></span>
                    <Badge status={app.status} />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="dash-empty-line">Belum ada aplikasi.</p>}
        </Panel>

        {admin ? (
          <Panel icon={Trophy} title="Kontributor teratas" hint="Jumlah aplikasi per pembuat" className="span-5">
            <RankBars items={owners} empty="Belum ada aplikasi." avatar photos={Object.fromEntries(users.filter(u => u.photo).map(u => [u.name, u.photo]))} />
          </Panel>
        ) : (
          <Panel icon={ListChecks} title="Lengkapi data" hint="Aplikasimu yang datanya belum lengkap" className="span-5">
            {incomplete.length ? (
              <ul className="todo-list">
                {incomplete.map(({ app, missing }, i) => (
                  <li key={app.id} style={{ '--delay': `${0.15 + i * 0.06}s` }}>
                    <button onClick={() => onOpen(app, true)}>
                      <b>{app.name}</b>
                      <small>Belum ada {missing.join(', ')}</small>
                      <ArrowRight size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="todo-done"><CheckCircle2 size={28} /><p>{scope.length ? 'Semua data aplikasimu sudah lengkap.' : 'Belum ada aplikasi.'}</p></div>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

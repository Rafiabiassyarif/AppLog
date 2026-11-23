export const STATUSES = ['Ide', 'Dikerjakan', 'Selesai', 'Maintenance'];
export const STATUS_CLASS = { Ide: 'idea', Dikerjakan: 'progress', Selesai: 'done', Maintenance: 'maintenance' };
export const TYPE_LABEL = { internal: 'Internal', personal: 'Personal', project: 'Proyek' };
export const APP_TYPES = ['internal', 'personal', 'project'];
export const LIMITS = { name: 80, owner: 60, tech: 120, link: 500, description: 280, client: 120, spec: 200, specs: 50 };

export const initials = name => name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'A';

export const techList = tech => String(tech || '').split(',').map(item => item.trim()).filter(Boolean);

export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Tanggal hari ini (zona waktu lokal) dalam format YYYY-MM-DD. */
export function todayISO(now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatDate(value) {
  if (!value) return '';
  return new Date(value + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Periode pengerjaan: "3 Mar 2026 – 20 Apr 2026", "Sejak 3 Mar 2026", atau tahun untuk data lama. */
export function formatPeriod(app) {
  if (!app.startDate) return app.year || '';
  if (!app.endDate) return 'Sejak ' + formatDate(app.startDate);
  return formatDate(app.startDate) + ' – ' + formatDate(app.endDate);
}

export const blankApp = () => ({
  name: '',
  type: 'internal',
  status: 'Dikerjakan',
  owner: '',
  startDate: todayISO(),
  endDate: '',
  logo: '',
  tech: '',
  link: '',
  description: '',
  client: '',
  deadline: '',
  members: [],
  specs: [],
});

/** Sisa waktu ke tenggat proyek. tone: late | soon | ok | done. */
export function deadlineInfo(app, today = todayISO()) {
  if (!app.deadline) return null;
  if (app.status === 'Selesai' || app.status === 'Maintenance') return { tone: 'done', text: 'Tenggat ' + formatDate(app.deadline) };
  const days = Math.round((new Date(app.deadline + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
  if (days < 0) return { tone: 'late', text: `Lewat tenggat ${-days} hari` };
  if (days === 0) return { tone: 'soon', text: 'Tenggat hari ini' };
  return { tone: days <= 7 ? 'soon' : 'ok', text: `${days} hari lagi` };
}

/** Progres checklist spesifikasi. */
export function specProgress(app) {
  const specs = app.specs || [];
  const done = specs.filter(s => s.done).length;
  return { done, total: specs.length, percent: specs.length ? Math.round((done / specs.length) * 100) : 0 };
}

/** Waktu relatif singkat: "baru saja", "5 menit lalu", "3 hari lalu", atau tanggal untuk yang lama. */
export function timeAgo(value, now = Date.now()) {
  if (!value) return '—';
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'baru saja';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

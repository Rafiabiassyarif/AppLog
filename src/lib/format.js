export const STATUSES = ['Ide', 'Dikerjakan', 'Selesai', 'Maintenance'];
export const STATUS_CLASS = { Ide: 'idea', Dikerjakan: 'progress', Selesai: 'done', Maintenance: 'maintenance' };
export const TYPE_LABEL = { internal: 'Internal', personal: 'Personal' };
export const LIMITS = { name: 80, owner: 60, tech: 120, link: 500, description: 280 };

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
});

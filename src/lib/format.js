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

export const blankApp = () => ({
  name: '',
  type: 'internal',
  status: 'Dikerjakan',
  owner: '',
  year: String(new Date().getFullYear()),
  tech: '',
  link: '',
  description: '',
});

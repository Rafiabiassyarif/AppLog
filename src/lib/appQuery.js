// Filter dan urutan aplikasi. Sama dengan server/query.cjs agar tampilan dan ekspor cocok.
export const SORT_OPTIONS = [
  { value: 'updated', label: 'Terakhir diperbarui' },
  { value: 'name', label: 'Nama A–Z' },
  { value: 'year', label: 'Mulai terbaru' },
  { value: 'status', label: 'Status' },
];

const SORTS = {
  updated: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''),
  name: (a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }),
  year: (a, b) => (b.startDate || b.year || '0').localeCompare(a.startDate || a.year || '0') || a.name.localeCompare(b.name, 'id'),
  status: (a, b) => a.status.localeCompare(b.status, 'id') || a.name.localeCompare(b.name, 'id'),
};

export function queryApps(apps, { q = '', type = 'all', status = 'all', createdBy = '', sort = 'updated' }) {
  const needle = q.trim().toLowerCase();
  return apps
    .filter(app => !createdBy || app.createdBy === createdBy || (app.members || []).some(m => m.userId === createdBy))
    .filter(app => type === 'all' || app.type === type)
    .filter(app => status === 'all' || app.status === status)
    .filter(app => !needle || [app.name, app.owner, app.tech, app.description].join(' ').toLowerCase().includes(needle))
    .sort(SORTS[sort] || SORTS.updated);
}

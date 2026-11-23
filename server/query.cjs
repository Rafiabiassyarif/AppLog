'use strict';

/** Filter dan urutan aplikasi. Logika yang sama dipakai di src/lib/appQuery.js. */
const SORTS = {
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  name: (a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }),
  year: (a, b) => (b.startDate || b.year || '0').localeCompare(a.startDate || a.year || '0') || a.name.localeCompare(b.name, 'id'),
  status: (a, b) => a.status.localeCompare(b.status, 'id') || a.name.localeCompare(b.name, 'id'),
};

function queryApps(apps, { q = '', type = '', status = '', createdBy = '', sort = 'updated' } = {}) {
  const needle = q.trim().toLowerCase();
  return apps
    .filter(app => !app.deletedAt)
    .filter(app => !createdBy || app.createdBy === createdBy)
    .filter(app => !type || type === 'all' || app.type === type)
    .filter(app => !status || status === 'all' || app.status === status)
    .filter(app => !needle || [app.name, app.owner, app.tech, app.description].join(' ').toLowerCase().includes(needle))
    .sort(SORTS[sort] || SORTS.updated);
}

module.exports = { queryApps };

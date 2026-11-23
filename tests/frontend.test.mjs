// Tes logika frontend (src/lib) tanpa browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { queryApps } from '../src/lib/appQuery.js';
import { initials, techList, blankApp, todayISO, formatPeriod } from '../src/lib/format.js';
import { api, UNAUTHORIZED_EVENT } from '../src/lib/api.js';

const require = createRequire(import.meta.url);
const server = require('../server/query.cjs');

const apps = [
  { id: '1', name: 'Absensi', owner: 'Budi', type: 'internal', status: 'Selesai', tech: 'React', description: '', year: '2024', startDate: '2024-05-02', createdBy: 'u1', updatedAt: '2026-01-03T00:00:00Z' },
  { id: '2', name: 'bot telegram', owner: 'Siti', type: 'personal', status: 'Ide', tech: 'Python', description: 'notifikasi', year: '2026', createdBy: 'u2', updatedAt: '2026-01-05T00:00:00Z' },
  { id: '3', name: 'Católogo', owner: 'Dewi', type: 'internal', status: 'Dikerjakan', tech: 'Laravel, MySQL', description: '', year: '', createdBy: 'u1', updatedAt: '2026-01-01T00:00:00Z' },
  { id: '4', name: 'Booking Ruang', owner: 'Budi', type: 'internal', status: 'Ide', tech: '', description: 'rapat', year: '2026', startDate: '2026-01-15', createdBy: 'u2', updatedAt: '2026-01-04T00:00:00Z' },
];
const ids = list => list.map(app => app.id);

test('filter dan urutan frontend sama dengan server (tampilan = ekspor)', () => {
  const cases = [
    {},
    { sort: 'name' },
    { sort: 'year' },
    { sort: 'status' },
    { q: 'BUDI' },
    { q: 'notif' },
    { type: 'internal', sort: 'name' },
    { status: 'Ide' },
    { createdBy: 'u1', sort: 'year' },
    { type: 'personal', status: 'Selesai' },
  ];
  for (const options of cases) {
    const front = queryApps(apps, { type: 'all', status: 'all', ...options });
    assert.deepEqual(ids(front), ids(server.queryApps(apps, options)), JSON.stringify(options));
  }
});

test('urutan default: terakhir diperbarui lebih dulu', () => {
  assert.deepEqual(ids(queryApps(apps, {})), ['2', '4', '1', '3']);
});

test('pencarian tidak peka huruf besar dan mencakup teknologi', () => {
  assert.deepEqual(ids(queryApps(apps, { q: 'mysql' })), ['3']);
  assert.deepEqual(ids(queryApps(apps, { q: '  zzz ' })), []);
});

test('initials dan techList', () => {
  assert.equal(initials('Rafi Abiassyarif Putra'), 'RA');
  assert.equal(initials('  budi '), 'B');
  assert.equal(initials(''), 'A');
  assert.equal(initials(undefined), 'A');
  assert.deepEqual(techList(' React, , Node.js ,'), ['React', 'Node.js']);
  assert.deepEqual(techList(null), []);
});

test('blankApp memakai tanggal hari ini', () => {
  assert.equal(blankApp().startDate, todayISO());
  assert.equal(todayISO(new Date(2026, 0, 5)), '2026-01-05');
  assert.notEqual(blankApp(), blankApp());
});

test('formatPeriod: rentang, masih berjalan, dan data lama', () => {
  assert.match(formatPeriod({ startDate: '2026-03-01', endDate: '2026-03-10' }), /2026 – 10/);
  assert.match(formatPeriod({ startDate: '2026-03-01', endDate: '' }), /^Sejak 1 Mar/);
  assert.equal(formatPeriod({ startDate: '', year: '2024' }), '2024');
  assert.equal(formatPeriod({}), '');
});

function mockFetch(handler) {
  globalThis.fetch = async (url, init) => handler(url, init);
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('api: mengirim JSON dan mengembalikan data', async () => {
  let seen;
  mockFetch((url, init) => {
    seen = init;
    return json(200, { ok: true });
  });
  assert.deepEqual(await api('/api/x', { method: 'POST', body: { a: 1 } }), { ok: true });
  assert.equal(seen.headers['Content-Type'], 'application/json');
  assert.equal(seen.body, '{"a":1}');
});

test('api: pesan error dari server, atau pesan cadangan bila bukan JSON', async () => {
  mockFetch(() => json(409, { error: 'Nama sudah dipakai.' }));
  await assert.rejects(api('/api/x'), { message: 'Nama sudah dipakai.', status: 409 });
  mockFetch(() => new Response('<html>', { status: 502, headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(api('/api/x'), { message: 'Permintaan gagal (kode 502).', status: 502 });
  mockFetch(() => {
    throw new TypeError('network');
  });
  await assert.rejects(api('/api/x'), { status: 0 });
});

test('api: 401 memicu event logout kecuali dimatikan', async () => {
  let fired = 0;
  globalThis.window = new EventTarget();
  globalThis.window.addEventListener(UNAUTHORIZED_EVENT, () => fired++);
  mockFetch(() => json(401, { error: 'Sesi berakhir.' }));
  await assert.rejects(api('/api/x'));
  await assert.rejects(api('/api/x', { notifyUnauthorized: false }));
  assert.equal(fired, 1);
});

'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { createApp } = require('../server/app.cjs');
const { createDb } = require('../server/db.cjs');

// Tes API butuh MySQL. Contoh: TEST_MYSQL_URL=mysql://root@127.0.0.1:3306
// Setiap run memakai database sementara applog_test_xxx yang dihapus setelah selesai.
const MYSQL_URL = process.env.TEST_MYSQL_URL;
const skip = MYSQL_URL ? false : 'atur TEST_MYSQL_URL (contoh mysql://root@127.0.0.1:3306) untuk tes API';
const it = (name, fn) => test(name, { skip }, fn);

let server;
let base;
let tmpDir;
let db;
let dbName;
let dbConfig;

async function withServerConnection(sql) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    await connection.query(sql);
  } finally {
    await connection.end();
  }
}

before(async () => {
  if (skip) return;
  const url = new URL(MYSQL_URL);
  dbName = `applog_test_${crypto.randomBytes(4).toString('hex')}`;
  dbConfig = { host: url.hostname, port: Number(url.port) || 3306, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) };
  await withServerConnection(`CREATE DATABASE ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'applog-test-'));
  db = createDb({ ...dbConfig, database: dbName });
  await db.init();
  ({ server } = createApp({ db, distDir: path.join(tmpDir, 'dist') }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  server.close();
  await db.close();
  await withServerConnection(`DROP DATABASE IF EXISTS ${dbName}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Klien kecil yang menyimpan cookie sesi seperti browser. */
function client() {
  let cookie = '';
  const call = async function (url, { method = 'GET', body, rawBody, headers = {} } = {}) {
    const hasBody = body !== undefined || rawBody !== undefined;
    const res = await fetch(base + url, {
      method,
      headers: { ...(hasBody || method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, data: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  };
  call.cookie = () => cookie;
  return call;
}

const admin = client();
const member = client();
let memberId;
let appId;

it('setup awal membuat admin pertama dan hanya bisa sekali', async () => {
  const session = await admin('/api/session');
  assert.equal(session.data.setupRequired, true);
  const setup = await admin('/api/setup', { method: 'POST', body: { name: 'Admin Uji', username: 'admin', password: 'rahasia-admin-1' } });
  assert.equal(setup.status, 201);
  assert.equal(setup.data.user.role, 'admin');
  const again = await client()('/api/setup', { method: 'POST', body: { name: 'X', username: 'xx1', password: 'rahasia-admin-2' } });
  assert.equal(again.status, 403);
});

it('header keamanan selalu dikirim', async () => {
  const res = await admin('/api/session');
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

it('admin membuat akun user; username duplikat ditolak', async () => {
  const created = await admin('/api/users', { method: 'POST', body: { name: 'Budi', username: 'budi', password: 'password-budi-1' } });
  assert.equal(created.status, 201);
  memberId = created.data.id;
  const dup = await admin('/api/users', { method: 'POST', body: { name: 'Budi 2', username: 'BUDI', password: 'password-budi-2' } });
  assert.equal(dup.status, 409);
});

it('login salah ditolak, login benar berhasil', async () => {
  const wrong = await member('/api/login', { method: 'POST', body: { username: 'budi', password: 'salah-salah' } });
  assert.equal(wrong.status, 401);
  const ok = await member('/api/login', { method: 'POST', body: { username: 'budi', password: 'password-budi-1' } });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/);
});

it('request non-JSON dan lintas situs ditolak', async () => {
  const res = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
  assert.equal(res.status, 415);
  const cross = await member('/api/apps', { method: 'POST', body: { name: 'X', owner: 'Budi' }, headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(cross.status, 403);
});

it('JSON rusak dijawab 400', async () => {
  const res = await member('/api/apps', { method: 'POST', rawBody: '{' });
  assert.equal(res.status, 400);
});

it('validasi aplikasi: link, tahun, nama ganda', async () => {
  const badLink = await member('/api/apps', { method: 'POST', body: { name: 'App A', owner: 'Budi', link: 'javascript:alert(1)' } });
  assert.equal(badLink.status, 400);
  const badYear = await member('/api/apps', { method: 'POST', body: { name: 'App A', owner: 'Budi', year: '1990' } });
  assert.equal(badYear.status, 400);
  const ok = await member('/api/apps', { method: 'POST', body: { name: 'App A', owner: 'Orang Lain', type: 'internal', status: 'Ide', year: '2026' } });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.owner, 'Budi', 'user biasa tidak boleh mengganti nama pembuat');
  appId = ok.data.id;
  const dup = await member('/api/apps', { method: 'POST', body: { name: 'app a', owner: 'Budi', type: 'internal', status: 'Ide' } });
  assert.equal(dup.status, 409);
});

it('hapus memindahkan ke Sampah dan bisa dipulihkan', async () => {
  assert.equal((await member(`/api/apps/${appId}`, { method: 'DELETE' })).status, 200);
  assert.equal((await member('/api/apps')).data.length, 0);
  assert.equal((await member('/api/trash')).data.length, 1);
  assert.equal((await member(`/api/apps/${appId}/restore`, { method: 'POST' })).status, 200);
  assert.equal((await member('/api/apps')).data.length, 1);
});

it('tanggal pengerjaan dan logo', async () => {
  const body = { name: 'App Tanggal', owner: 'Budi', type: 'internal', status: 'Selesai' };
  const post = extra => member('/api/apps', { method: 'POST', body: { ...body, ...extra } });
  assert.equal((await post({ startDate: '2026-02-30' })).status, 400, 'tanggal tidak ada');
  assert.equal((await post({ startDate: '12/03/2026' })).status, 400, 'format salah');
  assert.equal((await post({ startDate: '2026-03-10', endDate: '2026-03-01' })).status, 400, 'selesai sebelum mulai');
  assert.equal((await post({ logo: 'data:image/svg+xml;base64,PHN2Zz4=' })).status, 400, 'SVG ditolak');
  assert.equal((await post({ logo: 'data:image/png;base64,' + 'A'.repeat(90000) })).status, 400, 'logo terlalu besar');
  const logo = 'data:image/png;base64,iVBORw0KGgo=';
  const ok = await post({ startDate: '2026-03-01', endDate: '2026-03-10', logo, year: '2020' });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.startDate, '2026-03-01');
  assert.equal(ok.data.endDate, '2026-03-10');
  assert.equal(ok.data.logo, logo);
  assert.equal(ok.data.year, '2026', 'tahun mengikuti tanggal mulai');
  const cleared = await member(`/api/apps/${ok.data.id}`, { method: 'PUT', body: { ...body, startDate: '2026-03-01', logo: '' } });
  assert.equal(cleared.data.logo, '');
  assert.equal(cleared.data.endDate, '');
  assert.equal((await member(`/api/apps/${ok.data.id}`, { method: 'DELETE' })).status, 200);
});

it('user biasa tidak bisa akses fitur admin', async () => {
  assert.equal((await member('/api/users')).status, 403);
  assert.equal((await member('/api/audit')).status, 403);
  assert.equal((await member(`/api/trash/${appId}`, { method: 'DELETE' })).status, 403);
});

it('export xlsx dan pdf butuh login dan menghasilkan file', async () => {
  assert.equal((await client()('/api/export.xlsx')).status, 401);
  const xlsx = await admin('/api/export.xlsx');
  assert.equal(xlsx.status, 200);
  assert.equal(xlsx.data.subarray(0, 2).toString(), 'PK');
  const pdf = await admin('/api/export.pdf?mine=1');
  assert.equal(pdf.status, 200);
  assert.equal(pdf.data.subarray(0, 4).toString(), '%PDF');
});

it('nonaktifkan akun mengakhiri sesinya', async () => {
  const res = await admin(`/api/users/${memberId}`, { method: 'PATCH', body: { active: false } });
  assert.equal(res.status, 200);
  assert.equal((await member('/api/apps')).status, 401);
  const login = await client()('/api/login', { method: 'POST', body: { username: 'budi', password: 'password-budi-1' } });
  assert.equal(login.status, 403, 'akun nonaktif tidak bisa login');
});

it('admin tidak bisa menurunkan perannya sendiri', async () => {
  const me = (await admin('/api/session')).data.user;
  const res = await admin(`/api/users/${me.id}`, { method: 'PATCH', body: { role: 'member' } });
  assert.equal(res.status, 400);
});

it('reset password memberi password baru yang bisa dipakai', async () => {
  await admin(`/api/users/${memberId}`, { method: 'PATCH', body: { active: true } });
  const reset = await admin(`/api/users/${memberId}/reset-password`, { method: 'POST' });
  assert.equal(reset.status, 200);
  const login = await client()('/api/login', { method: 'POST', body: { username: 'budi', password: reset.data.password } });
  assert.equal(login.status, 200);
});

it('riwayat perubahan mencatat aktivitas', async () => {
  const audit = await admin('/api/audit');
  const actions = audit.data.map(item => item.action);
  for (const action of ['setup', 'user.create', 'app.create', 'app.delete', 'app.restore', 'user.reset-password']) {
    assert.ok(actions.includes(action), `audit berisi ${action}`);
  }
});

it('sesi tetap berlaku setelah server restart', async () => {
  const secondDb = createDb({ ...dbConfig, database: dbName });
  const second = createApp({ db: secondDb, distDir: path.join(tmpDir, 'dist') });
  await new Promise(resolve => second.server.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${second.server.address().port}/api/session`, { headers: { Cookie: admin.cookie() } });
    const data = await res.json();
    assert.equal(data.user?.username, 'admin');
  } finally {
    second.server.close();
    await secondDb.close();
  }
});

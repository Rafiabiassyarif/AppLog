'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server/app.cjs');

let server;
let base;
let tmpDir;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'applog-test-'));
  ({ server } = createApp({ dataFile: path.join(tmpDir, 'registry.json'), distDir: path.join(tmpDir, 'dist') }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
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

test('setup awal membuat admin pertama dan hanya bisa sekali', async () => {
  const session = await admin('/api/session');
  assert.equal(session.data.setupRequired, true);
  const setup = await admin('/api/setup', { method: 'POST', body: { name: 'Admin Uji', username: 'admin', password: 'rahasia-admin-1' } });
  assert.equal(setup.status, 201);
  assert.equal(setup.data.user.role, 'admin');
  const again = await client()('/api/setup', { method: 'POST', body: { name: 'X', username: 'xx1', password: 'rahasia-admin-2' } });
  assert.equal(again.status, 403);
});

test('header keamanan selalu dikirim', async () => {
  const res = await admin('/api/session');
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('admin membuat akun user; username duplikat ditolak', async () => {
  const created = await admin('/api/users', { method: 'POST', body: { name: 'Budi', username: 'budi', password: 'password-budi-1' } });
  assert.equal(created.status, 201);
  memberId = created.data.id;
  const dup = await admin('/api/users', { method: 'POST', body: { name: 'Budi 2', username: 'BUDI', password: 'password-budi-2' } });
  assert.equal(dup.status, 409);
});

test('login salah ditolak, login benar berhasil', async () => {
  const wrong = await member('/api/login', { method: 'POST', body: { username: 'budi', password: 'salah-salah' } });
  assert.equal(wrong.status, 401);
  const ok = await member('/api/login', { method: 'POST', body: { username: 'budi', password: 'password-budi-1' } });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/);
});

test('request non-JSON dan lintas situs ditolak', async () => {
  const res = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
  assert.equal(res.status, 415);
  const cross = await member('/api/apps', { method: 'POST', body: { name: 'X', owner: 'Budi' }, headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(cross.status, 403);
});

test('JSON rusak dijawab 400', async () => {
  const res = await member('/api/apps', { method: 'POST', rawBody: '{' });
  assert.equal(res.status, 400);
});

test('validasi aplikasi: link, tahun, nama ganda', async () => {
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

test('hapus memindahkan ke Sampah dan bisa dipulihkan', async () => {
  assert.equal((await member(`/api/apps/${appId}`, { method: 'DELETE' })).status, 200);
  assert.equal((await member('/api/apps')).data.length, 0);
  assert.equal((await member('/api/trash')).data.length, 1);
  assert.equal((await member(`/api/apps/${appId}/restore`, { method: 'POST' })).status, 200);
  assert.equal((await member('/api/apps')).data.length, 1);
});

test('user biasa tidak bisa akses fitur admin', async () => {
  assert.equal((await member('/api/users')).status, 403);
  assert.equal((await member('/api/audit')).status, 403);
  assert.equal((await member(`/api/trash/${appId}`, { method: 'DELETE' })).status, 403);
});

test('export xlsx dan pdf butuh login dan menghasilkan file', async () => {
  assert.equal((await client()('/api/export.xlsx')).status, 401);
  const xlsx = await admin('/api/export.xlsx');
  assert.equal(xlsx.status, 200);
  assert.equal(xlsx.data.subarray(0, 2).toString(), 'PK');
  const pdf = await admin('/api/export.pdf?mine=1');
  assert.equal(pdf.status, 200);
  assert.equal(pdf.data.subarray(0, 4).toString(), '%PDF');
});

test('nonaktifkan akun mengakhiri sesinya', async () => {
  const res = await admin(`/api/users/${memberId}`, { method: 'PATCH', body: { active: false } });
  assert.equal(res.status, 200);
  assert.equal((await member('/api/apps')).status, 401);
  const login = await client()('/api/login', { method: 'POST', body: { username: 'budi', password: 'password-budi-1' } });
  assert.equal(login.status, 403, 'akun nonaktif tidak bisa login');
});

test('admin tidak bisa menurunkan perannya sendiri', async () => {
  const me = (await admin('/api/session')).data.user;
  const res = await admin(`/api/users/${me.id}`, { method: 'PATCH', body: { role: 'member' } });
  assert.equal(res.status, 400);
});

test('reset password memberi password baru yang bisa dipakai', async () => {
  await admin(`/api/users/${memberId}`, { method: 'PATCH', body: { active: true } });
  const reset = await admin(`/api/users/${memberId}/reset-password`, { method: 'POST' });
  assert.equal(reset.status, 200);
  const login = await client()('/api/login', { method: 'POST', body: { username: 'budi', password: reset.data.password } });
  assert.equal(login.status, 200);
});

test('riwayat perubahan mencatat aktivitas', async () => {
  const audit = await admin('/api/audit');
  const actions = audit.data.map(item => item.action);
  for (const action of ['setup', 'user.create', 'app.create', 'app.delete', 'app.restore', 'user.reset-password']) {
    assert.ok(actions.includes(action), `audit berisi ${action}`);
  }
});

test('sesi tetap berlaku setelah server restart', async () => {
  const second = createApp({ dataFile: path.join(tmpDir, 'registry.json'), distDir: path.join(tmpDir, 'dist') });
  await new Promise(resolve => second.server.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${second.server.address().port}/api/session`, { headers: { Cookie: admin.cookie() } });
    const data = await res.json();
    assert.equal(data.user?.username, 'admin');
  } finally {
    second.server.close();
  }
});

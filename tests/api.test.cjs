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

it('Sampah: pulihkan semua, hapus satu, dan kosongkan sesuai hak akses', async () => {
  const body = { owner: 'Budi', type: 'internal', status: 'Ide' };
  const make = async (as, name) => (await as('/api/apps', { method: 'POST', body: { ...body, name } })).data.id;
  const trash = (as, id) => as(`/api/apps/${id}`, { method: 'DELETE' });
  const adminApp = await make(admin, 'Sampah Admin');
  const [a, b] = [await make(member, 'Sampah A'), await make(member, 'Sampah B')];
  for (const [as, id] of [[admin, adminApp], [member, a], [member, b]]) assert.equal((await trash(as, id)).status, 200);

  assert.equal((await member('/api/trash')).data.length, 2, 'member hanya melihat miliknya');
  assert.equal((await member(`/api/trash/${adminApp}`, { method: 'DELETE' })).status, 403, 'member tidak bisa hapus milik orang lain');

  // Nama yang sudah dipakai aplikasi aktif dilewati saat pulihkan semua.
  const twin = await make(member, 'Sampah A');
  const all = await member('/api/trash/restore', { method: 'POST' });
  assert.deepEqual(all.data, { restored: ['Sampah B'], skipped: ['Sampah A'] });
  assert.equal((await member('/api/trash')).data.length, 1);

  assert.equal((await member(`/api/trash/${a}`, { method: 'DELETE' })).status, 200, 'member hapus permanen miliknya');
  for (const id of [b, twin]) assert.equal((await trash(member, id)).status, 200);
  const empty = await member('/api/trash', { method: 'DELETE' });
  assert.deepEqual(empty.data, { removed: 2 });
  assert.equal((await member('/api/trash')).data.length, 0);
  assert.equal((await admin('/api/trash')).data.length, 1, 'milik Admin tidak ikut terhapus');
  assert.deepEqual((await admin('/api/trash', { method: 'DELETE' })).data, { removed: 1 });
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

it('admin mengubah password anggota dengan password yang ditentukan', async () => {
  await admin(`/api/users/${memberId}`, { method: 'PATCH', body: { active: true } });
  const url = `/api/users/${memberId}/reset-password`;
  assert.equal((await admin(url, { method: 'POST', body: {} })).status, 400, 'password wajib');
  assert.equal((await admin(url, { method: 'POST', body: { password: 'pendek' } })).status, 400, 'minimal 8 karakter');
  const reset = await admin(url, { method: 'POST', body: { password: 'Pilihan-Admin-2026' } });
  assert.equal(reset.status, 200);
  assert.equal(reset.data.password, undefined, 'password tidak dikirim balik');
  const login = await client()('/api/login', { method: 'POST', body: { username: 'budi', password: 'Pilihan-Admin-2026' } });
  assert.equal(login.status, 200);
});

it('riwayat perubahan mencatat aktivitas', async () => {
  const audit = await admin('/api/audit');
  const actions = audit.data.map(item => item.action);
  for (const action of ['setup', 'user.create', 'app.create', 'app.delete', 'app.restore', 'user.reset-password']) {
    assert.ok(actions.includes(action), `audit berisi ${action}`);
  }
});

it('admin bisa menghapus satu atau semua riwayat', async () => {
  // Sesi lama budi berakhir saat password diubah Admin, jadi login ulang.
  const budi = client();
  assert.equal((await budi('/api/login', { method: 'POST', body: { username: 'budi', password: 'Pilihan-Admin-2026' } })).status, 200);
  const before = (await admin('/api/audit')).data;
  assert.equal((await budi(`/api/audit/${before[0].id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await budi('/api/audit', { method: 'DELETE' })).status, 403);

  assert.equal((await admin(`/api/audit/${before[0].id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await admin(`/api/audit/${before[0].id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await admin('/api/audit')).data.length, before.length - 1);

  const cleared = await admin('/api/audit', { method: 'DELETE' });
  assert.equal(cleared.data.removed, before.length - 1);
  const after = (await admin('/api/audit')).data;
  assert.equal(after.length, 1, 'hanya tersisa catatan pengosongan');
  assert.equal(after[0].action, 'audit.clear');
});

it('setiap akun bisa memperbarui profil sendiri: nama, bio, foto', async () => {
  const budi = client();
  assert.equal((await budi('/api/login', { method: 'POST', body: { username: 'budi', password: 'Pilihan-Admin-2026' } })).status, 200);
  const photo = 'data:image/webp;base64,UklGRg==';
  const saved = await budi('/api/profile', { method: 'PATCH', body: { name: 'Budi Santoso', bio: 'Frontend developer', photo } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.user.name, 'Budi Santoso');
  assert.equal(saved.data.user.bio, 'Frontend developer');
  assert.equal(saved.data.user.photo, photo);
  assert.equal((await budi('/api/session')).data.user.photo, photo, 'tersimpan di database');
  const listed = (await admin('/api/users')).data.find(u => u.username === 'budi');
  assert.equal(listed.bio, 'Frontend developer');

  assert.equal((await budi('/api/profile', { method: 'PATCH', body: { photo: 'data:image/svg+xml;base64,PHN2Zz4=' } })).status, 400, 'SVG ditolak');
  assert.equal((await budi('/api/profile', { method: 'PATCH', body: { photo: 'data:image/png;base64,' + 'A'.repeat(90000) } })).status, 400, 'foto terlalu besar');
  assert.equal((await budi('/api/profile', { method: 'PATCH', body: { bio: 'x'.repeat(281) } })).status, 400, 'bio terlalu panjang');
  assert.equal((await budi('/api/profile', { method: 'PATCH', body: { name: '  ' } })).status, 400, 'nama wajib');
  assert.equal((await budi('/api/profile', { method: 'PATCH', body: { role: 'admin' } })).data.user.role, 'member', 'peran tidak bisa diubah lewat profil');

  const removed = await budi('/api/profile', { method: 'PATCH', body: { photo: '' } });
  assert.equal(removed.data.user.photo, '');
  assert.equal((await admin('/api/audit')).data[0].action, 'profile');
  assert.equal((await client()('/api/profile', { method: 'PATCH', body: { bio: 'x' } })).status, 401, 'butuh login');
});

it('anggota bisa melihat profil tim tanpa data rahasia', async () => {
  const budi = client();
  assert.equal((await budi('/api/login', { method: 'POST', body: { username: 'budi', password: 'Pilihan-Admin-2026' } })).status, 200);
  await budi('/api/profile', { method: 'PATCH', body: { bio: 'Suka bikin dashboard' } });
  const res = await budi('/api/profiles');
  assert.equal(res.status, 200);
  const me = res.data.find(p => p.username === 'budi');
  assert.equal(me.bio, 'Suka bikin dashboard');
  assert.ok(res.data.some(p => p.username === 'admin'), 'akun lain ikut tampil');
  for (const p of res.data) {
    assert.deepEqual(Object.keys(p).sort(), ['active', 'bio', 'id', 'name', 'photo', 'role', 'username']);
  }
  assert.equal((await budi('/api/users')).status, 403, 'daftar akun tetap khusus Admin');
  assert.equal((await client()('/api/profiles')).status, 401, 'butuh login');
});

it('sudah login: landing page dan /login dialihkan ke dashboard', async () => {
  const visit = (url, cookie) => fetch(base + url, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
  for (const url of ['/', '/login']) {
    assert.notEqual((await visit(url)).status, 302, `${url} tetap terbuka tanpa login`);
    const res = await visit(url, admin.cookie());
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/admin');
  }
  const budi = client();
  await budi('/api/login', { method: 'POST', body: { username: 'budi', password: 'Pilihan-Admin-2026' } });
  assert.equal((await visit('/', budi.cookie())).headers.get('location'), '/user');
});

it('proyek: tim, spesifikasi, dan hak akses anggota', async () => {
  for (const [name, username] of [['Citra', 'citra'], ['Dodi', 'dodi']]) {
    assert.equal((await admin('/api/users', { method: 'POST', body: { name, username, password: 'password-' + username + '-1' } })).status, 201);
  }
  const login = async (username, password) => {
    const c = client();
    assert.equal((await c('/api/login', { method: 'POST', body: { username, password } })).status, 200);
    return c;
  };
  const budi = await login('budi', 'Pilihan-Admin-2026');
  const citra = await login('citra', 'password-citra-1');
  const dodi = await login('dodi', 'password-dodi-1');
  const ids = Object.fromEntries((await budi('/api/profiles')).data.map(p => [p.username, p.id]));

  const body = {
    name: 'Sistem Absensi Kampus', owner: 'x', type: 'project', status: 'Dikerjakan', client: 'Pak Dosen Web', deadline: '2026-12-20',
    members: [ids.budi, ids.citra], leadId: ids.budi, specs: [{ text: 'Login dengan NIM' }, { text: 'Rekap PDF', done: true }],
  };
  // Proyek buatan User dikerjakan sendiri: pemberi dan tenggat saja, tim dan spesifikasi diabaikan.
  const solo = await budi('/api/apps', { method: 'POST', body: { ...body, name: 'Tugas Budi' } });
  assert.equal(solo.status, 201);
  assert.equal(solo.data.type, 'project');
  assert.equal(solo.data.client, 'Pak Dosen Web');
  assert.deepEqual([solo.data.members.length, solo.data.specs.length], [0, 0], 'User tidak bisa mengisi tim dan spesifikasi');
  const soloEdit = await budi(`/api/apps/${solo.data.id}`, { method: 'PUT', body: { ...body, name: 'Tugas Budi', client: 'Bu Dosen', deadline: '2026-12-31' } });
  assert.equal(soloEdit.status, 200);
  assert.deepEqual([soloEdit.data.client, soloEdit.data.deadline, soloEdit.data.members.length, soloEdit.data.specs.length], ['Bu Dosen', '2026-12-31', 0, 0]);
  const own = await budi('/api/apps', { method: 'POST', body: { name: 'Catatan Budi', owner: 'x', type: 'personal', status: 'Ide' } });
  assert.equal(own.status, 201);
  const converted = await budi(`/api/apps/${own.data.id}`, { method: 'PUT', body: { ...own.data, type: 'project', client: 'Kampus', members: [ids.citra], leadId: ids.citra } });
  assert.equal(converted.status, 200, 'User boleh mengubah aplikasinya jadi proyek');
  assert.equal(converted.data.members.length, 0);
  for (const id of [solo.data.id, own.data.id]) assert.equal((await budi(`/api/apps/${id}`, { method: 'DELETE' })).status, 200);

  assert.equal((await admin('/api/apps', { method: 'POST', body: { ...body, name: 'Salah', members: ['tidak-ada'] } })).status, 400, 'anggota harus akun yang ada');
  assert.equal((await admin('/api/apps', { method: 'POST', body: { ...body, name: 'Salah', leadId: ids.dodi } })).status, 400, 'ketua harus anggota');
  const created = await admin('/api/apps', { method: 'POST', body });
  assert.equal(created.status, 201);
  const project = created.data;
  assert.equal(project.client, 'Pak Dosen Web');
  assert.equal(project.deadline, '2026-12-20');
  assert.deepEqual(project.members.map(m => [m.userId, m.lead]).sort(), [[ids.budi, true], [ids.citra, false]].sort());
  assert.deepEqual(project.specs.map(s => [s.text, s.done]), [['Login dengan NIM', false], ['Rekap PDF', true]]);

  // Anggota tim: hanya bagian kerja dan centang spesifikasi.
  const edited = await citra(`/api/apps/${project.id}`, { method: 'PUT', body: {
    ...body, name: 'Diganti', client: 'Orang lain', status: 'Selesai', tech: 'React', members: [ids.citra], leadId: ids.citra,
    specs: [{ id: project.specs[0].id, text: 'Teks baru', done: true }],
  } });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.name, 'Sistem Absensi Kampus');
  assert.equal(edited.data.client, 'Pak Dosen Web');
  assert.equal(edited.data.status, 'Selesai');
  assert.equal(edited.data.tech, 'React');
  assert.equal(edited.data.members.length, 2, 'tim tidak berubah');
  assert.deepEqual(edited.data.specs.map(s => [s.text, s.done]), [['Login dengan NIM', true], ['Rekap PDF', true]]);

  // Kiriman sebagian (seperti dari AI agent): field lain tetap.
  const partial = await citra(`/api/apps/${project.id}`, { method: 'PUT', body: { description: 'Dikerjakan bareng tim', startDate: '2026-11-01' } });
  assert.equal(partial.status, 200);
  assert.equal(partial.data.description, 'Dikerjakan bareng tim');
  assert.equal(partial.data.startDate, '2026-11-01');
  assert.equal(partial.data.status, 'Selesai');
  assert.equal(partial.data.tech, 'React');
  assert.equal((await citra(`/api/apps/${project.id}`, { method: 'PUT', body: { startDate: 'kemarin' } })).status, 400);

  const ticked = await citra(`/api/apps/${project.id}/specs/${project.specs[1].id}`, { method: 'PATCH', body: { done: false } });
  assert.equal(ticked.status, 200);
  assert.equal(ticked.data.specs[1].done, false);
  assert.equal((await citra(`/api/apps/${project.id}`, { method: 'DELETE' })).status, 403, 'anggota tidak bisa menghapus');

  // Bukan anggota: hanya lihat.
  assert.equal((await dodi(`/api/apps/${project.id}`, { method: 'PUT', body })).status, 403);
  assert.equal((await dodi(`/api/apps/${project.id}/specs/${project.specs[0].id}`, { method: 'PATCH', body: { done: true } })).status, 403);

  // Ekspor "Aplikasi saya" milik anggota tim ikut memuat proyek.
  const exported = await citra('/api/export.pdf?mine=1');
  assert.equal(exported.status, 200);

  // Ketua tim tetap anggota: tidak bisa menghapus proyek.
  assert.equal((await budi(`/api/apps/${project.id}`, { method: 'DELETE' })).status, 403);

  // Admin mengganti jenis: data proyek dikosongkan.
  const changed = await admin(`/api/apps/${project.id}`, { method: 'PUT', body: { ...body, type: 'personal' } });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.client, '');
  assert.deepEqual([changed.data.members.length, changed.data.specs.length], [0, 0]);
  assert.equal((await admin(`/api/apps/${project.id}`, { method: 'DELETE' })).status, 200);
});

it('token API untuk AI agent (MCP)', async () => {
  const budi = client();
  assert.equal((await budi('/api/login', { method: 'POST', body: { username: 'budi', password: 'Pilihan-Admin-2026' } })).status, 200);
  assert.equal((await budi('/api/tokens', { method: 'POST', body: { name: '' } })).status, 400);
  const made = await budi('/api/tokens', { method: 'POST', body: { name: 'Agent laptop' } });
  assert.equal(made.status, 201);
  assert.match(made.data.token, /^applog_[a-f0-9]{64}$/);
  const list = (await budi('/api/tokens')).data;
  assert.equal(list.length, 1);
  assert.equal(list[0].hint, made.data.token.slice(-4));
  assert.equal(JSON.stringify(list).includes(made.data.token), false, 'token utuh tidak dikirim lagi');

  const bearer = async (url, opts = {}) => {
    const res = await fetch(base + url, {
      method: opts.method || 'GET',
      headers: { Authorization: `Bearer ${opts.token || made.data.token}`, ...(opts.method && opts.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  const who = await bearer('/api/session');
  assert.equal(who.data.user.username, 'budi');
  assert.equal((await bearer('/api/apps')).status, 200);
  const added = await bearer('/api/apps', { method: 'POST', body: { name: 'Dari Agent', owner: 'x', type: 'internal', status: 'Ide' } });
  assert.equal(added.status, 201);
  assert.equal(added.data.owner, who.data.user.name);
  const agentProject = await bearer('/api/apps', { method: 'POST', body: { name: 'Proyek Agent', owner: 'x', type: 'project', status: 'Ide', client: 'Dosen', specs: [{ text: 'Login' }] } });
  assert.equal(agentProject.status, 201);
  assert.equal(agentProject.data.specs.length, 0, 'spesifikasi hanya diatur Admin');
  assert.equal((await bearer(`/api/apps/${added.data.id}`, { method: 'DELETE' })).status, 403, 'token tidak boleh menghapus');
  assert.equal((await bearer('/api/tokens')).status, 403, 'token tidak boleh mengelola token');
  assert.equal((await bearer('/api/apps', { token: 'applog_' + '0'.repeat(64) })).status, 401);

  assert.equal((await budi(`/api/tokens/${made.data.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await bearer('/api/apps')).status, 401, 'token dicabut');
  assert.equal((await budi(`/api/apps/${added.data.id}`, { method: 'DELETE' })).status, 200);
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

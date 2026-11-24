'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HttpError, badRequest, forbidden, notFound, conflict } = require('./errors.cjs');
const { makeCredentials, verifyPassword, createSessions, createLoginLimiter, createApiToken, apiTokenHash } = require('./auth.cjs');
const validate = require('./validate.cjs');
const { queryApps } = require('./query.cjs');
const { writeXlsx, writePdf } = require('./export.cjs');
const openapi = require('./openapi.cjs');

const ROOT = path.join(__dirname, '..');
const BODY_LIMIT = 100 * 1024;
const COOKIE = 'applog_session';
const SPA_ROUTES = new Set(['/', '/login', '/admin', '/user']);
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

const publicUser = user => ({ id: user.id, name: user.name, username: user.username, role: user.role, active: user.active, photo: user.photo || '', bio: user.bio || '' });
const isLoopback = ip => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
const isDuplicate = error => error && error.code === 'ER_DUP_ENTRY';

/**
 * Membuat server HTTP AppLog.
 * `db` berasal dari createDb() (server/db.cjs) dan harus sudah di-init().
 */
function createApp({ db, distDir = path.join(ROOT, 'dist'), trustProxy = false, secureCookie = false }) {
  if (!db) throw new Error('createApp membutuhkan koneksi database (db).');
  const sessions = createSessions(db);
  const limiter = createLoginLimiter();
  const timer = setInterval(() => {
    limiter.prune();
    sessions.prune().catch(error => console.error('Gagal membersihkan sesi:', error.message));
  }, 10 * 60 * 1000);
  timer.unref();

  const clientIp = req => {
    if (trustProxy) {
      const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (forwarded) return forwarded;
    }
    return req.socket.remoteAddress || 'unknown';
  };
  const isSecure = req => secureCookie || (trustProxy && req.headers['x-forwarded-proto'] === 'https');
  // Alamat publik server untuk dokumentasi API (mengikuti proxy bila TRUST_PROXY aktif).
  const baseUrlOf = req => {
    const forwardedHost = trustProxy && String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const host = forwardedHost || req.headers.host || 'localhost';
    return `${isSecure(req) ? 'https' : 'http'}://${host}`;
  };
  const tokenOf = req => (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`))?.[1] || null;

  function setSessionCookie(req, res, token, maxAge) {
    const secure = isSecure(req) ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`);
  }

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > BODY_LIMIT) throw new HttpError(413, 'Data terlalu besar.');
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text) return {};
    try {
      const value = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      return value;
    } catch {
      throw badRequest('Format data tidak valid.');
    }
  }

  async function findApp(id) {
    const app = await db.apps.byId(id);
    if (!app) throw notFound('Aplikasi tidak ditemukan.');
    return app;
  }

  async function findUser(id) {
    const user = await db.users.byId(id);
    if (!user) throw notFound('Akun tidak ditemukan.');
    return user;
  }

  async function assertUniqueName(name, exceptId) {
    if (await db.apps.nameTaken(name, exceptId)) throw conflict('Nama aplikasi sudah terdaftar.');
  }

  async function restoreApp(user, app) {
    const updatedAt = new Date().toISOString();
    await db.apps.update(app.id, { deletedAt: null, deletedBy: null, updatedAt });
    await db.audit.add(user, 'app.restore', app.name, 'Dipulihkan dari Sampah');
    return { ...app, deletedAt: null, deletedBy: null, updatedAt };
  }

  async function purgeApp(user, app) {
    await db.apps.remove(app.id);
    await db.audit.add(user, 'app.purge', app.name, 'Dihapus permanen');
  }

  async function insertUser(account) {
    try {
      await db.users.insert(account);
    } catch (error) {
      if (isDuplicate(error)) throw conflict('Username sudah digunakan.');
      throw error;
    }
  }

  // Admin atau pembuatnya. Proyek dari Admin dibuat Admin, jadi anggota timnya tidak pernah jadi pembuat.
  const canManage = (user, app) => user.role === 'admin' || (app.createdBy && app.createdBy === user.id);
  // Proyek buatan User dikerjakan sendiri: hanya pemberi dan tenggat. Tim dan spesifikasi hanya diatur Admin,
  // jadi saat User menyimpan, tim dan spesifikasi yang sudah ada (jika pernah diatur Admin) dipertahankan.
  const keepTeam = (user, input, app) => {
    if (user.role === 'admin' || input.type !== 'project') return;
    input.members = app && app.type === 'project' ? app.members : [];
    input.specs = app && app.type === 'project' ? app.specs : [];
  };
  // Bagian kerja yang diisi anggota tim proyek sendiri (lewat web atau AI agent).
  const WORK_FIELDS = ['status', 'tech', 'link', 'description', 'startDate', 'endDate', 'logo'];
  const TOKEN_LIMIT = 10;
  // Anggota tim proyek boleh mengerjakan (status, link, teknologi, centang spesifikasi), bukan mengelola.
  const isMember = (user, app) => (app.members || []).some(m => m.userId === user.id);

  async function assertMembersExist(members) {
    if (!members.length) return;
    const ids = new Set((await db.users.all()).map(u => u.id));
    if (members.some(m => !ids.has(m.userId))) throw badRequest('Anggota tim tidak ditemukan.');
  }

  async function saveTeam(appId, input) {
    await db.apps.setMembers(appId, input.members);
    await db.apps.setSpecs(appId, input.specs);
  }

  const teamKey = app => JSON.stringify((app.members || []).map(m => [m.userId, m.lead]).sort());
  const specKey = app => JSON.stringify((app.specs || []).map(s => [s.text, s.done]));

  // ---------- Route handlers ----------
  // Setiap handler menerima ctx = { req, res, url, user, token, params, body() }.

  const routes = [
    ['GET', '/api/session', async ({ user }) => ({ user: user ? publicUser(user) : null, setupRequired: (await db.users.count()) === 0 }), { token: true }],

    ['POST', '/api/setup', async ctx => {
      if (await db.users.count()) throw forbidden('Workspace sudah disiapkan.');
      if (!isLoopback(ctx.req.socket.remoteAddress)) throw forbidden('Admin pertama hanya bisa dibuat dari komputer server.');
      const body = await ctx.body();
      const admin = {
        id: crypto.randomUUID(),
        name: validate.userName(body.name),
        username: validate.username(body.username),
        role: 'admin',
        active: true,
        ...(await makeCredentials(validate.password(body.password))),
      };
      await insertUser(admin);
      await db.audit.add(admin, 'setup', admin.username, 'Admin pertama dibuat');
      const token = await sessions.create(admin.id);
      setSessionCookie(ctx.req, ctx.res, token, sessions.maxAgeSeconds);
      return { status: 201, data: { user: publicUser(admin) } };
    }, { public: true }],

    ['POST', '/api/login', async ctx => {
      const body = await ctx.body();
      const name = String(body.username || '').toLowerCase().slice(0, 40);
      const ip = clientIp(ctx.req);
      if (limiter.blocked(ip, name)) throw new HttpError(429, 'Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.');
      const user = name ? await db.users.byUsername(name) : null;
      const ok = await verifyPassword(user, body.password);
      if (!ok) {
        limiter.fail(ip, name);
        throw new HttpError(401, 'Username atau password salah.');
      }
      if (!user.active) throw forbidden('Akun ini dinonaktifkan. Hubungi admin.');
      limiter.success(ip, name);
      const token = await sessions.create(user.id);
      setSessionCookie(ctx.req, ctx.res, token, sessions.maxAgeSeconds);
      return { user: publicUser(user) };
    }, { public: true }],

    ['POST', '/api/logout', async ctx => {
      await sessions.destroy(ctx.token);
      setSessionCookie(ctx.req, ctx.res, '', 0);
      return { ok: true };
    }, { public: true }],

    ['POST', '/api/password', async ({ user, token, body }) => {
      const input = await body();
      if (!(await verifyPassword(user, input.currentPassword))) throw badRequest('Password saat ini tidak sesuai.');
      await db.users.update(user.id, await makeCredentials(validate.password(input.password, 'Password baru')));
      await sessions.destroyForUser(user.id, token);
      await db.audit.add(user, 'password', user.username, 'Mengganti password sendiri');
      return { ok: true };
    }],

    // Profil sendiri: nama, bio, foto. Semua peran boleh.
    ['PATCH', '/api/profile', async ({ user, body }) => {
      const input = await body();
      const fields = {};
      const changes = [];
      if (input.name !== undefined) {
        const name = validate.userName(input.name);
        if (name !== user.name) { fields.name = name; changes.push('nama'); }
      }
      if (input.bio !== undefined) {
        const bio = validate.bio(input.bio);
        if (bio !== (user.bio || '')) { fields.bio = bio; changes.push('bio'); }
      }
      if (input.photo !== undefined) {
        const photo = validate.photo(input.photo);
        if (photo !== (user.photo || '')) { fields.photo = photo; changes.push(photo ? 'foto' : 'foto dihapus'); }
      }
      if (changes.length) {
        await db.users.update(user.id, fields);
        await db.audit.add(user, 'profile', user.username, `Memperbarui profil: ${changes.join(', ')}`);
      }
      return { user: publicUser({ ...user, ...fields }) };
    }],

    // Profil anggota tim (tanpa data rahasia), untuk melihat profil pembuat aplikasi.
    ['GET', '/api/profiles', async () => (await db.users.all()).map(publicUser), { token: true }],

    // ----- Token API (AI agent / MCP) milik sendiri -----
    ['GET', '/api/tokens', async ({ user }) => db.tokens.forUser(user.id)],

    ['POST', '/api/tokens', async ({ user, body }) => {
      const name = validate.tokenName((await body()).name);
      if ((await db.tokens.count(user.id)) >= TOKEN_LIMIT) throw badRequest(`Maksimal ${TOKEN_LIMIT} token. Cabut token lama dulu.`);
      const { token, hash, hint } = createApiToken();
      const id = crypto.randomUUID();
      await db.tokens.insert({ id, userId: user.id, name, hash, hint });
      await db.audit.add(user, 'token.create', name, 'Membuat token API');
      return { status: 201, data: { id, name, hint, token } };
    }],

    ['DELETE', '/api/tokens/:id', async ({ user, params }) => {
      if (!(await db.tokens.remove(params.id, user.id))) throw notFound('Token tidak ditemukan.');
      await db.audit.add(user, 'token.delete', '', 'Mencabut token API');
      return { ok: true };
    }],

    // ----- Akun (admin) -----
    ['GET', '/api/users', async () => (await db.users.all()).map(publicUser), { admin: true }],

    ['POST', '/api/users', async ({ user, body }) => {
      const input = await body();
      const account = {
        id: crypto.randomUUID(),
        name: validate.userName(input.name),
        username: validate.username(input.username),
        role: input.role ? validate.role(input.role) : 'member',
        active: true,
        ...(await makeCredentials(validate.password(input.password))),
      };
      await insertUser(account);
      await db.audit.add(user, 'user.create', account.username, account.role === 'admin' ? 'Peran Admin' : 'Peran User');
      return { status: 201, data: publicUser(account) };
    }, { admin: true }],

    ['PATCH', '/api/users/:id', async ({ user, params, body }) => {
      const account = await findUser(params.id);
      const input = await body();
      const changes = [];
      const fields = {};
      if (input.name !== undefined) {
        const name = validate.userName(input.name);
        if (name !== account.name) {
          changes.push(`nama "${account.name}" → "${name}"`);
          fields.name = name;
        }
      }
      if (input.role !== undefined) {
        const role = validate.role(input.role);
        if (role !== account.role) {
          if (account.id === user.id) throw badRequest('Kamu tidak dapat mengubah peranmu sendiri.');
          if (account.role === 'admin' && !(await db.users.activeAdmins(account.id))) throw badRequest('Minimal harus ada satu Admin aktif.');
          changes.push(`peran → ${role === 'admin' ? 'Admin' : 'User'}`);
          fields.role = role;
        }
      }
      if (input.active !== undefined) {
        if (typeof input.active !== 'boolean') throw badRequest('Status akun tidak valid.');
        if (input.active !== account.active) {
          if (account.id === user.id) throw badRequest('Kamu tidak dapat menonaktifkan akunmu sendiri.');
          if (!input.active && account.role === 'admin' && !(await db.users.activeAdmins(account.id))) throw badRequest('Minimal harus ada satu Admin aktif.');
          fields.active = input.active;
          changes.push(input.active ? 'diaktifkan' : 'dinonaktifkan');
        }
      }
      if (changes.length) {
        await db.users.update(account.id, fields);
        if (fields.active === false) await sessions.destroyForUser(account.id);
        await db.audit.add(user, 'user.update', account.username, changes.join(', '));
      }
      return publicUser({ ...account, ...fields });
    }, { admin: true }],

    // Admin menentukan password baru (tidak acak) lalu memberikannya ke anggota.
    ['POST', '/api/users/:id/reset-password', async ({ user, params, body }) => {
      const account = await findUser(params.id);
      if (account.id === user.id) throw badRequest('Gunakan menu Ubah password untuk akunmu sendiri.');
      const password = validate.password((await body()).password, 'Password baru');
      await db.users.update(account.id, await makeCredentials(password));
      await sessions.destroyForUser(account.id);
      await db.audit.add(user, 'user.reset-password', account.username, 'Password diubah admin');
      return { ok: true };
    }, { admin: true }],

    ['DELETE', '/api/users/:id', async ({ user, params }) => {
      const account = await findUser(params.id);
      if (account.id === user.id) throw badRequest('Kamu tidak dapat menghapus akunmu sendiri.');
      if (account.role === 'admin' && !(await db.users.activeAdmins(account.id))) throw badRequest('Minimal harus ada satu Admin aktif.');
      await db.users.remove(account.id); // sesi ikut terhapus (ON DELETE CASCADE)
      await db.audit.add(user, 'user.delete', account.username, 'Akun dihapus; aplikasinya tetap tersimpan');
      return { ok: true };
    }, { admin: true }],

    // ----- Aplikasi -----
    ['GET', '/api/openapi.json', ({ req, res }) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return openapi.buildSpec(baseUrlOf(req));
    }, { public: true, token: true }],

    ['GET', '/api/apps', () => db.apps.active(), { token: true }],

    ['GET', '/api/apps/:id', async ({ params }) => {
      const app = await findApp(params.id);
      if (app.deletedAt) throw notFound('Aplikasi tidak ditemukan.');
      return app;
    }, { token: true }],

    ['POST', '/api/apps', async ({ user, body }) => {
      const input = validate.appInput(await body());
      keepTeam(user, input, null);
      if (user.role !== 'admin') input.owner = user.name;
      await assertUniqueName(input.name);
      await assertMembersExist(input.members);
      const now = new Date().toISOString();
      const app = { id: crypto.randomUUID(), ...input, createdBy: user.id, createdAt: now, updatedAt: now, deletedAt: null, deletedBy: null };
      await db.apps.insert(app);
      await saveTeam(app.id, input);
      await db.audit.add(user, 'app.create', app.name, input.type === 'project' ? `Proyek, tim ${input.members.length} orang` : '');
      return { status: 201, data: await db.apps.byId(app.id) };
    }, { token: true }],

    ['PUT', '/api/apps/:id', async ({ user, params, body }) => {
      const app = await findApp(params.id);
      if (app.deletedAt) throw notFound('Aplikasi tidak ditemukan.');
      const manage = canManage(user, app);
      if (!manage && !isMember(user, app)) throw forbidden('Kamu hanya dapat mengubah aplikasi milikmu.');
      const data = await body();
      let input;
      if (manage) {
        // Field yang tidak dikirim memakai nilai lama, jadi AI agent boleh mengirim sebagian.
        const lead = (app.members.find(m => m.lead) || {}).userId;
        input = validate.appInput({
          ...app,
          members: app.members.map(m => m.userId),
          leadId: 'members' in data ? undefined : lead,
          ...data,
        });
        keepTeam(user, input, app);
        if (user.role !== 'admin') input.owner = app.owner || user.name;
        await assertUniqueName(input.name, app.id);
        await assertMembersExist(input.members);
      } else {
        // Anggota tim: hanya bagian kerja (WORK_FIELDS) dan centang spesifikasi yang sudah ada.
        // Field yang tidak dikirim tetap memakai nilai lama, jadi AI agent boleh mengirim sebagian.
        const work = Object.fromEntries(WORK_FIELDS.filter(key => data[key] !== undefined).map(key => [key, data[key]]));
        const checked = validate.appInput({ ...app, ...work, leadId: (app.members.find(m => m.lead) || {}).userId, members: app.members.map(m => m.userId) });
        const done = new Map((Array.isArray(data.specs) ? data.specs : []).map(s => [s && s.id, Boolean(s && s.done)]));
        input = {
          ...Object.fromEntries(WORK_FIELDS.map(key => [key, checked[key]])),
          year: checked.year,
          members: app.members,
          specs: app.specs.map(s => ({ ...s, done: done.has(s.id) ? done.get(s.id) : s.done })),
        };
      }
      const changed = Object.keys(input).filter(key => !['members', 'specs'].includes(key) && input[key] !== app[key]);
      if (teamKey(input) !== teamKey(app)) changed.push('tim');
      if (specKey(input) !== specKey(app)) changed.push('spesifikasi');
      const updatedAt = new Date().toISOString();
      await db.apps.update(app.id, { ...input, updatedAt });
      await saveTeam(app.id, input);
      const updated = await db.apps.byId(app.id);
      await db.audit.add(user, 'app.update', updated.name, changed.length ? `Mengubah: ${changed.join(', ')}` : 'Tanpa perubahan');
      return updated;
    }, { token: true }],

    // Centang/batal centang satu poin spesifikasi (pengelola atau anggota tim).
    ['PATCH', '/api/apps/:id/specs/:specId', async ({ user, params, body }) => {
      const app = await findApp(params.id);
      if (app.deletedAt) throw notFound('Aplikasi tidak ditemukan.');
      if (!canManage(user, app) && !isMember(user, app)) throw forbidden('Hanya tim proyek yang dapat mencentang spesifikasi.');
      const { done } = await body();
      if (typeof done !== 'boolean') throw badRequest('Status centang tidak valid.');
      const spec = app.specs.find(s => s.id === params.specId);
      if (!spec) throw notFound('Poin spesifikasi tidak ditemukan.');
      await db.apps.setSpecDone(app.id, spec.id, done);
      await db.apps.update(app.id, { updatedAt: new Date().toISOString() });
      await db.audit.add(user, 'app.update', app.name, `${done ? 'Selesai' : 'Batal selesai'}: ${spec.text}`);
      return db.apps.byId(app.id);
    }, { token: true }],

    ['DELETE', '/api/apps/:id', async ({ user, params }) => {
      const app = await findApp(params.id);
      if (app.deletedAt) throw notFound('Aplikasi tidak ditemukan.');
      if (!canManage(user, app)) throw forbidden('Kamu hanya dapat menghapus aplikasi milikmu.');
      await db.apps.update(app.id, { deletedAt: new Date().toISOString(), deletedBy: user.id });
      await db.audit.add(user, 'app.delete', app.name, 'Dipindahkan ke Sampah');
      return { ok: true };
    }],

    ['GET', '/api/trash', async ({ user }) => (await db.apps.trash()).filter(app => canManage(user, app))],

    ['POST', '/api/apps/:id/restore', async ({ user, params }) => {
      const app = await findApp(params.id);
      if (!app.deletedAt) throw badRequest('Aplikasi tidak ada di Sampah.');
      if (!canManage(user, app)) throw forbidden('Kamu hanya dapat memulihkan aplikasi milikmu.');
      await assertUniqueName(app.name, app.id);
      return restoreApp(user, app);
    }],

    // Pulihkan semua isi Sampah milik user (Admin: semua). Nama yang sudah dipakai aplikasi aktif dilewati.
    ['POST', '/api/trash/restore', async ({ user }) => {
      const restored = [];
      const skipped = [];
      for (const app of (await db.apps.trash()).filter(item => canManage(user, item))) {
        if (await db.apps.nameTaken(app.name, app.id)) skipped.push(app.name);
        else restored.push((await restoreApp(user, app)).name);
      }
      return { restored, skipped };
    }],

    // Kosongkan Sampah: member hanya aplikasi miliknya, Admin semuanya.
    ['DELETE', '/api/trash', async ({ user }) => {
      const items = (await db.apps.trash()).filter(app => canManage(user, app));
      for (const app of items) await purgeApp(user, app);
      return { removed: items.length };
    }],

    ['DELETE', '/api/trash/:id', async ({ user, params }) => {
      const app = await findApp(params.id);
      if (!app.deletedAt) throw badRequest('Pindahkan aplikasi ke Sampah terlebih dahulu.');
      if (!canManage(user, app)) throw forbidden('Kamu hanya dapat menghapus permanen aplikasi milikmu.');
      await purgeApp(user, app);
      return { ok: true };
    }],

    ['GET', '/api/audit', () => db.audit.recent(300), { admin: true }],

    // Hapus semua riwayat. Satu catatan baru ditulis supaya tetap terlihat siapa yang mengosongkan.
    ['DELETE', '/api/audit', async ({ user }) => {
      const removed = await db.audit.clear();
      await db.audit.add(user, 'audit.clear', 'Riwayat perubahan', `Menghapus ${removed} catatan`);
      return { removed };
    }, { admin: true }],

    ['DELETE', '/api/audit/:id', async ({ params }) => {
      if (!(await db.audit.remove(params.id))) throw notFound('Catatan riwayat tidak ditemukan.');
      return { ok: true };
    }, { admin: true }],

    ['GET', '/api/export.xlsx', async ({ res, url, user }) => {
      await writeXlsx(res, await exportRows(url, user));
      return null;
    }],

    ['GET', '/api/export.pdf', async ({ res, url, user }) => {
      writePdf(res, await exportRows(url, user));
      return null;
    }],
  ].map(([method, pattern, handler, options = {}]) => {
    const keys = [];
    const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([^/]+)'; })}$`);
    return { method, regex, keys, handler, options };
  });

  async function exportRows(url, user) {
    const params = Object.fromEntries(url.searchParams);
    return queryApps(await db.apps.active(), { ...params, createdBy: params.mine === '1' ? user.id : '' });
  }

  function sendJson(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  }

  async function handleApi(req, res, url) {
    if (req.method !== 'GET') {
      if (req.headers['sec-fetch-site'] === 'cross-site') throw forbidden('Permintaan ditolak.');
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'Permintaan harus berformat JSON.');
    }
    const pathMatches = routes.filter(r => r.regex.test(url.pathname));
    if (!pathMatches.length) throw notFound('Tidak ditemukan.');
    const route = pathMatches.find(r => r.method === req.method);
    if (!route) throw new HttpError(405, 'Metode tidak didukung.');

    // AI agent memakai "Authorization: Bearer applog_..."; browser memakai cookie sesi.
    const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/i)?.[1];
    if (bearer) {
      const hash = apiTokenHash(bearer);
      const tokenUser = hash && (await db.tokens.findUser(hash));
      if (!tokenUser) throw new HttpError(401, 'Token API tidak valid atau sudah dicabut.');
      if (!route.options.token) throw forbidden('Token API tidak boleh mengakses fitur ini.');
      const match = url.pathname.match(route.regex);
      const params = Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
      const result = await route.handler({ req, res, url, user: tokenUser, token: null, params, body: () => readBody(req) });
      if (result && typeof result === 'object' && 'status' in result && 'data' in result) return sendJson(res, result.status, result.data);
      return sendJson(res, 200, result);
    }

    const token = tokenOf(req);
    const user = await sessions.find(token);
    if (!route.options.public && !user && url.pathname !== '/api/session') throw new HttpError(401, 'Sesi berakhir. Silakan login kembali.');
    if (route.options.admin && user.role !== 'admin') throw forbidden('Hanya Admin yang dapat melakukan ini.');

    const match = url.pathname.match(route.regex);
    const params = Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
    const result = await route.handler({ req, res, url, user, token, params, body: () => readBody(req) });
    if (result === null) return;
    if (result && typeof result === 'object' && 'status' in result && 'data' in result) return sendJson(res, result.status, result.data);
    return sendJson(res, 200, result);
  }

  async function serveStatic(req, res, url) {
    // Sudah login: landing page dan halaman login dialihkan ke dashboard.
    if (['/', '/login'].includes(url.pathname)) {
      const user = await sessions.find(tokenOf(req));
      if (user) {
        res.writeHead(302, { Location: user.role === 'admin' ? '/admin' : '/user', 'Cache-Control': 'no-store' });
        return res.end();
      }
    }
    if (['/dashboard', '/admin', '/user'].includes(url.pathname)) {
      const user = await sessions.find(tokenOf(req));
      const destination = user ? (user.role === 'admin' ? '/admin' : '/user') : '/login';
      if (url.pathname !== destination) {
        res.writeHead(302, { Location: destination + url.search, 'Cache-Control': 'no-store' });
        return res.end();
      }
    }
    // Dokumentasi API publik: /docs (HTML), /docs.css, /llms.txt (Markdown untuk LLM).
    const docs = {
      '/docs': () => ['text/html; charset=utf-8', openapi.renderDocs(openapi.buildSpec(baseUrlOf(req)))],
      '/docs.css': () => ['text/css; charset=utf-8', openapi.DOCS_CSS],
      '/llms.txt': () => ['text/plain; charset=utf-8', openapi.renderLlms(openapi.buildSpec(baseUrlOf(req)))],
    }[url.pathname];
    if (docs) {
      const [type, content] = docs();
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      return res.end(content);
    }
    let file = null;
    let cache = 'no-cache';
    if (SPA_ROUTES.has(url.pathname)) file = path.join(distDir, 'index.html');
    else if (url.pathname === '/logo.svg') file = path.join(distDir, 'logo.svg');
    else if (url.pathname.startsWith('/assets/')) {
      file = path.resolve(distDir, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(distDir + path.sep)) file = null;
      cache = 'public, max-age=31536000, immutable';
    }
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Halaman tidak ditemukan.');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
    if (isSecure(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else await serveStatic(req, res, url);
    } catch (error) {
      const known = error instanceof HttpError;
      if (!known) console.error(error);
      if (res.headersSent) return res.end();
      sendJson(res, known ? error.status : 500, { error: known ? error.message : 'Terjadi kesalahan pada server. Coba lagi.' });
    }
  });
  server.on('close', () => clearInterval(timer));
  return { server };
}

module.exports = { createApp };

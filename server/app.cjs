'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HttpError, badRequest, forbidden, notFound, conflict } = require('./errors.cjs');
const { makeCredentials, verifyPassword, randomPassword, createSessions, createLoginLimiter } = require('./auth.cjs');
const validate = require('./validate.cjs');
const { queryApps } = require('./query.cjs');
const { writeXlsx, writePdf } = require('./export.cjs');

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

const publicUser = user => ({ id: user.id, name: user.name, username: user.username, role: user.role, active: user.active });
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

  async function insertUser(account) {
    try {
      await db.users.insert(account);
    } catch (error) {
      if (isDuplicate(error)) throw conflict('Username sudah digunakan.');
      throw error;
    }
  }

  const canManage = (user, app) => user.role === 'admin' || (app.createdBy && app.createdBy === user.id);

  // ---------- Route handlers ----------
  // Setiap handler menerima ctx = { req, res, url, user, token, params, body() }.

  const routes = [
    ['GET', '/api/session', async ({ user }) => ({ user: user ? publicUser(user) : null, setupRequired: (await db.users.count()) === 0 })],

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

    ['POST', '/api/users/:id/reset-password', async ({ user, params }) => {
      const account = await findUser(params.id);
      if (account.id === user.id) throw badRequest('Gunakan menu Ubah password untuk akunmu sendiri.');
      const password = randomPassword();
      await db.users.update(account.id, await makeCredentials(password));
      await sessions.destroyForUser(account.id);
      await db.audit.add(user, 'user.reset-password', account.username, 'Password direset admin');
      return { password };
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
    ['GET', '/api/apps', () => db.apps.active()],

    ['POST', '/api/apps', async ({ user, body }) => {
      const input = validate.appInput(await body());
      if (user.role !== 'admin') input.owner = user.name;
      await assertUniqueName(input.name);
      const now = new Date().toISOString();
      const app = { id: crypto.randomUUID(), ...input, createdBy: user.id, createdAt: now, updatedAt: now, deletedAt: null, deletedBy: null };
      await db.apps.insert(app);
      await db.audit.add(user, 'app.create', app.name);
      return { status: 201, data: app };
    }],

    ['PUT', '/api/apps/:id', async ({ user, params, body }) => {
      const app = await findApp(params.id);
      if (app.deletedAt) throw notFound('Aplikasi tidak ditemukan.');
      if (!canManage(user, app)) throw forbidden('Kamu hanya dapat mengubah aplikasi milikmu.');
      const input = validate.appInput(await body());
      if (user.role !== 'admin') input.owner = app.owner || user.name;
      await assertUniqueName(input.name, app.id);
      const changed = Object.keys(input).filter(key => input[key] !== app[key]);
      const updated = { ...app, ...input, updatedAt: new Date().toISOString() };
      await db.apps.update(app.id, { ...input, updatedAt: updated.updatedAt });
      await db.audit.add(user, 'app.update', updated.name, changed.length ? `Mengubah: ${changed.join(', ')}` : 'Tanpa perubahan');
      return updated;
    }],

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
      const restored = { ...app, deletedAt: null, deletedBy: null, updatedAt: new Date().toISOString() };
      await db.apps.update(app.id, { deletedAt: null, deletedBy: null, updatedAt: restored.updatedAt });
      await db.audit.add(user, 'app.restore', app.name, 'Dipulihkan dari Sampah');
      return restored;
    }],

    ['DELETE', '/api/trash/:id', async ({ user, params }) => {
      const app = await findApp(params.id);
      if (!app.deletedAt) throw badRequest('Pindahkan aplikasi ke Sampah terlebih dahulu.');
      await db.apps.remove(app.id);
      await db.audit.add(user, 'app.purge', app.name, 'Dihapus permanen');
      return { ok: true };
    }, { admin: true }],

    ['GET', '/api/audit', () => db.audit.recent(300), { admin: true }],

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
    if (['/dashboard', '/admin', '/user'].includes(url.pathname)) {
      const user = await sessions.find(tokenOf(req));
      const destination = user ? (user.role === 'admin' ? '/admin' : '/user') : '/login';
      if (url.pathname !== destination) {
        res.writeHead(302, { Location: destination + url.search, 'Cache-Control': 'no-store' });
        return res.end();
      }
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

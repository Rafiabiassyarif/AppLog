'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HttpError, badRequest, forbidden, notFound, conflict } = require('./errors.cjs');
const { createStore } = require('./store.cjs');
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

function createApp({ dataFile = path.join(ROOT, 'data', 'registry.json'), distDir = path.join(ROOT, 'dist'), backupDir, trustProxy = false, secureCookie = false } = {}) {
  const store = createStore(dataFile, backupDir ? { backupDir } : {});
  const { db } = store;
  const sessions = createSessions(store);
  const limiter = createLoginLimiter();
  const timer = setInterval(() => {
    limiter.prune();
    if (sessions.prune()) store.persist();
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

  function activeAdmins(excludeId) {
    return db.users.filter(u => u.role === 'admin' && u.active && u.id !== excludeId).length;
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

  function findApp(id) {
    const app = db.apps.find(a => a.id === id);
    if (!app) throw notFound('Aplikasi tidak ditemukan.');
    return app;
  }

  function findUser(id) {
    const user = db.users.find(u => u.id === id);
    if (!user) throw notFound('Akun tidak ditemukan.');
    return user;
  }

  function assertUniqueName(name, exceptId) {
    const lower = name.toLowerCase();
    if (db.apps.some(a => !a.deletedAt && a.id !== exceptId && a.name.toLowerCase() === lower)) {
      throw conflict('Nama aplikasi sudah terdaftar.');
    }
  }

  const canManage = (user, app) => user.role === 'admin' || (app.createdBy && app.createdBy === user.id);

  // ---------- Route handlers ----------
  // Setiap handler menerima ctx = { req, res, url, user, token, params, body() }.

  const routes = [
    ['GET', '/api/session', ({ user }) => ({ user: user ? publicUser(user) : null, setupRequired: db.users.length === 0 })],

    ['POST', '/api/setup', async ctx => {
      if (db.users.length) throw forbidden('Workspace sudah disiapkan.');
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
      db.users.push(admin);
      store.audit(admin, 'setup', admin.username, 'Admin pertama dibuat');
      const token = sessions.create(admin.id);
      setSessionCookie(ctx.req, ctx.res, token, sessions.maxAgeSeconds);
      return { status: 201, data: { user: publicUser(admin) } };
    }, { public: true }],

    ['POST', '/api/login', async ctx => {
      const body = await ctx.body();
      const name = String(body.username || '').toLowerCase().slice(0, 40);
      const ip = clientIp(ctx.req);
      if (limiter.blocked(ip, name)) throw new HttpError(429, 'Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.');
      const user = db.users.find(u => u.username === name);
      const ok = await verifyPassword(user, body.password);
      if (!ok) {
        limiter.fail(ip, name);
        throw new HttpError(401, 'Username atau password salah.');
      }
      if (!user.active) throw forbidden('Akun ini dinonaktifkan. Hubungi admin.');
      limiter.success(ip, name);
      const token = sessions.create(user.id);
      setSessionCookie(ctx.req, ctx.res, token, sessions.maxAgeSeconds);
      return { user: publicUser(user) };
    }, { public: true }],

    ['POST', '/api/logout', ctx => {
      sessions.destroy(ctx.token);
      setSessionCookie(ctx.req, ctx.res, '', 0);
      return { ok: true };
    }, { public: true }],

    ['POST', '/api/password', async ({ user, token, body }) => {
      const input = await body();
      if (!(await verifyPassword(user, input.currentPassword))) throw badRequest('Password saat ini tidak sesuai.');
      Object.assign(user, await makeCredentials(validate.password(input.password, 'Password baru')));
      sessions.destroyForUser(user.id, token);
      store.audit(user, 'password', user.username, 'Mengganti password sendiri');
      store.persist();
      return { ok: true };
    }],

    // ----- Akun (admin) -----
    ['GET', '/api/users', () => db.users.map(publicUser), { admin: true }],

    ['POST', '/api/users', async ({ user, body }) => {
      const input = await body();
      const username = validate.username(input.username);
      if (db.users.some(u => u.username === username)) throw conflict('Username sudah digunakan.');
      const account = {
        id: crypto.randomUUID(),
        name: validate.userName(input.name),
        username,
        role: input.role ? validate.role(input.role) : 'member',
        active: true,
        ...(await makeCredentials(validate.password(input.password))),
      };
      db.users.push(account);
      store.audit(user, 'user.create', account.username, account.role === 'admin' ? 'Peran Admin' : 'Peran User');
      store.persist();
      return { status: 201, data: publicUser(account) };
    }, { admin: true }],

    ['PATCH', '/api/users/:id', async ({ user, params, body }) => {
      const account = findUser(params.id);
      const input = await body();
      const changes = [];
      if (input.name !== undefined) {
        const name = validate.userName(input.name);
        if (name !== account.name) {
          changes.push(`nama "${account.name}" → "${name}"`);
          account.name = name;
        }
      }
      if (input.role !== undefined) {
        const role = validate.role(input.role);
        if (role !== account.role) {
          if (account.id === user.id) throw badRequest('Kamu tidak dapat mengubah peranmu sendiri.');
          if (account.role === 'admin' && !activeAdmins(account.id)) throw badRequest('Minimal harus ada satu Admin aktif.');
          changes.push(`peran → ${role === 'admin' ? 'Admin' : 'User'}`);
          account.role = role;
        }
      }
      if (input.active !== undefined) {
        if (typeof input.active !== 'boolean') throw badRequest('Status akun tidak valid.');
        if (input.active !== account.active) {
          if (account.id === user.id) throw badRequest('Kamu tidak dapat menonaktifkan akunmu sendiri.');
          if (!input.active && account.role === 'admin' && !activeAdmins(account.id)) throw badRequest('Minimal harus ada satu Admin aktif.');
          account.active = input.active;
          if (!account.active) sessions.destroyForUser(account.id);
          changes.push(account.active ? 'diaktifkan' : 'dinonaktifkan');
        }
      }
      if (changes.length) {
        store.audit(user, 'user.update', account.username, changes.join(', '));
        store.persist();
      }
      return publicUser(account);
    }, { admin: true }],

    ['POST', '/api/users/:id/reset-password', async ({ user, params }) => {
      const account = findUser(params.id);
      if (account.id === user.id) throw badRequest('Gunakan menu Ubah password untuk akunmu sendiri.');
      const password = randomPassword();
      Object.assign(account, await makeCredentials(password));
      sessions.destroyForUser(account.id);
      store.audit(user, 'user.reset-password', account.username, 'Password direset admin');
      store.persist();
      return { password };
    }, { admin: true }],

    ['DELETE', '/api/users/:id', ({ user, params }) => {
      const account = findUser(params.id);
      if (account.id === user.id) throw badRequest('Kamu tidak dapat menghapus akunmu sendiri.');
      if (account.role === 'admin' && !activeAdmins(account.id)) throw badRequest('Minimal harus ada satu Admin aktif.');
      db.users = db.users.filter(u => u.id !== account.id);
      sessions.destroyForUser(account.id);
      store.audit(user, 'user.delete', account.username, 'Akun dihapus; aplikasinya tetap tersimpan');
      store.persist();
      return { ok: true };
    }, { admin: true }],

    // ----- Aplikasi -----
    ['GET', '/api/apps', () => db.apps.filter(a => !a.deletedAt)],

    ['POST', '/api/apps', async ({ user, body }) => {
      const input = validate.appInput(await body());
      if (user.role !== 'admin') input.owner = user.name;
      assertUniqueName(input.name);
      const now = new Date().toISOString();
      const app = { id: crypto.randomUUID(), ...input, createdBy: user.id, createdAt: now, updatedAt: now, deletedAt: null, deletedBy: null };
      db.apps.push(app);
      store.audit(user, 'app.create', app.name);
      store.persist();
      return { status: 201, data: app };
    }],

    ['PUT', '/api/apps/:id', async ({ user, params, body }) => {
      const app = findApp(params.id);
      if (app.deletedAt) throw notFound('Aplikasi tidak ditemukan.');
      if (!canManage(user, app)) throw forbidden('Kamu hanya dapat mengubah aplikasi milikmu.');
      const input = validate.appInput(await body());
      if (user.role !== 'admin') input.owner = app.owner || user.name;
      assertUniqueName(input.name, app.id);
      const changed = Object.keys(input).filter(key => input[key] !== app[key]);
      Object.assign(app, input, { updatedAt: new Date().toISOString() });
      store.audit(user, 'app.update', app.name, changed.length ? `Mengubah: ${changed.join(', ')}` : 'Tanpa perubahan');
      store.persist();
      return app;
    }],

    ['DELETE', '/api/apps/:id', ({ user, params }) => {
      const app = findApp(params.id);
      if (app.deletedAt) throw notFound('Aplikasi tidak ditemukan.');
      if (!canManage(user, app)) throw forbidden('Kamu hanya dapat menghapus aplikasi milikmu.');
      app.deletedAt = new Date().toISOString();
      app.deletedBy = user.id;
      store.audit(user, 'app.delete', app.name, 'Dipindahkan ke Sampah');
      store.persist();
      return { ok: true };
    }],

    ['GET', '/api/trash', ({ user }) => db.apps
      .filter(a => a.deletedAt && canManage(user, a))
      .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))],

    ['POST', '/api/apps/:id/restore', ({ user, params }) => {
      const app = findApp(params.id);
      if (!app.deletedAt) throw badRequest('Aplikasi tidak ada di Sampah.');
      if (!canManage(user, app)) throw forbidden('Kamu hanya dapat memulihkan aplikasi milikmu.');
      assertUniqueName(app.name, app.id);
      app.deletedAt = null;
      app.deletedBy = null;
      app.updatedAt = new Date().toISOString();
      store.audit(user, 'app.restore', app.name, 'Dipulihkan dari Sampah');
      store.persist();
      return app;
    }],

    ['DELETE', '/api/trash/:id', ({ user, params }) => {
      const app = findApp(params.id);
      if (!app.deletedAt) throw badRequest('Pindahkan aplikasi ke Sampah terlebih dahulu.');
      db.apps = db.apps.filter(a => a.id !== app.id);
      store.audit(user, 'app.purge', app.name, 'Dihapus permanen');
      store.persist();
      return { ok: true };
    }, { admin: true }],

    ['GET', '/api/audit', () => db.audit.slice(-300).reverse(), { admin: true }],

    ['GET', '/api/export.xlsx', async ({ res, url, user }) => {
      await writeXlsx(res, exportRows(url, user));
      return null;
    }],

    ['GET', '/api/export.pdf', ({ res, url, user }) => {
      writePdf(res, exportRows(url, user));
      return null;
    }],
  ].map(([method, pattern, handler, options = {}]) => {
    const keys = [];
    const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([^/]+)'; })}$`);
    return { method, regex, keys, handler, options };
  });

  function exportRows(url, user) {
    const params = Object.fromEntries(url.searchParams);
    return queryApps(db.apps, { ...params, createdBy: params.mine === '1' ? user.id : '' });
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
    const auth = sessions.find(token);
    const user = auth?.user || null;
    if (!route.options.public && !user && url.pathname !== '/api/session') throw new HttpError(401, 'Sesi berakhir. Silakan login kembali.');
    if (route.options.admin && user.role !== 'admin') throw forbidden('Hanya Admin yang dapat melakukan ini.');

    const match = url.pathname.match(route.regex);
    const params = Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
    const result = await route.handler({ req, res, url, user, token, params, body: () => readBody(req) });
    if (result === null) return;
    if (result && typeof result === 'object' && 'status' in result && 'data' in result) return sendJson(res, result.status, result.data);
    return sendJson(res, 200, result);
  }

  function serveStatic(req, res, url) {
    if (['/dashboard', '/admin', '/user'].includes(url.pathname)) {
      const user = sessions.find(tokenOf(req))?.user;
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
      else serveStatic(req, res, url);
    } catch (error) {
      const known = error instanceof HttpError;
      if (!known) console.error(error);
      if (res.headersSent) return res.end();
      sendJson(res, known ? error.status : 500, { error: known ? error.message : 'Terjadi kesalahan pada server. Coba lagi.' });
    }
  });
  server.on('close', () => clearInterval(timer));
  return { server, store };
}

module.exports = { createApp };

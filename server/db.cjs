'use strict';

const crypto = require('crypto');
const mysql = require('mysql2/promise');

const AUDIT_LIMIT = 1000;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) NOT NULL PRIMARY KEY,
    username VARCHAR(40) NOT NULL,
    name VARCHAR(60) NOT NULL,
    role ENUM('admin','member') NOT NULL DEFAULT 'member',
    active TINYINT(1) NOT NULL DEFAULT 1,
    salt CHAR(32) NOT NULL,
    hash CHAR(128) NOT NULL,
    photo MEDIUMTEXT NULL,
    bio VARCHAR(280) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_users_username (username)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id CHAR(64) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    expires BIGINT NOT NULL,
    KEY idx_sessions_user (user_id),
    KEY idx_sessions_expires (expires),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS apps (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    owner VARCHAR(60) NOT NULL DEFAULT '',
    type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    tech VARCHAR(120) NOT NULL DEFAULT '',
    link VARCHAR(500) NOT NULL DEFAULT '',
    description VARCHAR(280) NOT NULL DEFAULT '',
    year VARCHAR(4) NOT NULL DEFAULT '',
    logo MEDIUMTEXT NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    client VARCHAR(120) NOT NULL DEFAULT '',
    deadline DATE NULL,
    created_by CHAR(36) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3) NULL,
    deleted_by CHAR(36) NULL,
    KEY idx_apps_deleted (deleted_at),
    KEY idx_apps_created_by (created_by)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS app_members (
    app_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    is_lead TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (app_id, user_id),
    KEY idx_app_members_user (user_id),
    CONSTRAINT fk_app_members_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE,
    CONSTRAINT fk_app_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS app_specs (
    id CHAR(36) NOT NULL PRIMARY KEY,
    app_id CHAR(36) NOT NULL,
    text VARCHAR(200) NOT NULL,
    done TINYINT(1) NOT NULL DEFAULT 0,
    position INT NOT NULL DEFAULT 0,
    KEY idx_app_specs_app (app_id),
    CONSTRAINT fk_app_specs_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS api_tokens (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    name VARCHAR(60) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    hint VARCHAR(16) NOT NULL DEFAULT '',
    created_at DATETIME(3) NOT NULL,
    last_used_at DATETIME(3) NULL,
    UNIQUE KEY uq_api_tokens_hash (token_hash),
    KEY idx_api_tokens_user (user_id),
    CONSTRAINT fk_api_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS audit (
    seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id CHAR(36) NOT NULL,
    at DATETIME(3) NOT NULL,
    user_id CHAR(36) NULL,
    user_name VARCHAR(60) NOT NULL,
    action VARCHAR(40) NOT NULL,
    target VARCHAR(255) NOT NULL DEFAULT '',
    detail TEXT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

/** Konfigurasi dari DATABASE_URL (mysql://user:pass@host:3306/nama) atau DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME. */
function configFromEnv(env = process.env) {
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    if (url.protocol !== 'mysql:') throw new Error('DATABASE_URL harus diawali mysql://');
    return {
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
    };
  }
  if (!env.DB_NAME) throw new Error('Atur DATABASE_URL atau DB_NAME (beserta DB_HOST, DB_USER, DB_PASSWORD) untuk koneksi MySQL.');
  return {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT) || 3306,
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME,
  };
}

// DATETIME disimpan dalam UTC dan dikirim ke frontend sebagai ISO string, sama seperti versi JSON dulu.
const iso = value => (value ? `${value.replace(' ', 'T')}Z` : null);
const toDate = value => (value ? new Date(value) : null);
const dateOrNull = value => value || null;

const rowToUser = row => row && ({
  id: row.id,
  username: row.username,
  name: row.name,
  role: row.role,
  active: Boolean(row.active),
  salt: row.salt,
  hash: row.hash,
  photo: row.photo || '',
  bio: row.bio || '',
});

const rowToApp = row => row && ({
  id: row.id,
  name: row.name,
  owner: row.owner,
  type: row.type,
  status: row.status,
  tech: row.tech,
  link: row.link,
  description: row.description,
  year: row.year,
  logo: row.logo || '',
  startDate: row.start_date || '',
  endDate: row.end_date || '',
  client: row.client || '',
  deadline: row.deadline || '',
  members: [],
  specs: [],
  createdBy: row.created_by,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  deletedAt: iso(row.deleted_at),
  deletedBy: row.deleted_by,
});

const APP_COLUMNS = {
  name: 'name', owner: 'owner', type: 'type', status: 'status', tech: 'tech', link: 'link',
  description: 'description', year: 'year', logo: 'logo', startDate: 'start_date', endDate: 'end_date', client: 'client', deadline: 'deadline',
  createdBy: 'created_by', createdAt: 'created_at', updatedAt: 'updated_at', deletedAt: 'deleted_at', deletedBy: 'deleted_by',
};
const APP_DATES = new Set(['createdAt', 'updatedAt', 'deletedAt']);

function appValues(fields) {
  const columns = [];
  const values = [];
  for (const [key, value] of Object.entries(fields)) {
    if (!APP_COLUMNS[key]) continue;
    columns.push(APP_COLUMNS[key]);
    if (APP_DATES.has(key)) values.push(toDate(value));
    else if (key === 'startDate' || key === 'endDate' || key === 'deadline') values.push(dateOrNull(value));
    else values.push(value ?? null);
  }
  return { columns, values };
}

/**
 * Penyimpanan MySQL. Satu pool koneksi untuk seluruh server.
 * Tabel dibuat otomatis lewat init() bila belum ada.
 */
function createDb(config = configFromEnv()) {
  const pool = mysql.createPool({
    ...config,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: true,
    connectionLimit: 10,
    waitForConnections: true,
  });
  const q = async (sql, params = []) => (await pool.execute(sql, params))[0];

  async function init() {
    for (const statement of SCHEMA) await pool.query(statement);
    // Database lama: tambahkan kolom profil bila belum ada.
    const columns = (await q("SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'")).map(c => c.name);
    if (!columns.includes('photo')) await pool.query('ALTER TABLE users ADD COLUMN photo MEDIUMTEXT NULL AFTER hash');
    if (!columns.includes('bio')) await pool.query('ALTER TABLE users ADD COLUMN bio VARCHAR(280) NULL AFTER photo');
    // Kolom proyek (client, tenggat) untuk database lama.
    const appColumns = (await q("SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'apps'")).map(c => c.name);
    if (!appColumns.includes('client')) await pool.query("ALTER TABLE apps ADD COLUMN client VARCHAR(120) NOT NULL DEFAULT '' AFTER end_date");
    if (!appColumns.includes('deadline')) await pool.query('ALTER TABLE apps ADD COLUMN deadline DATE NULL AFTER client');
    // Nama pembuat aplikasi User selalu nama akunnya. Perbaiki data lama yang tertinggal setelah ganti nama.
    await pool.query("UPDATE apps a JOIN users u ON u.id = a.created_by SET a.owner = u.name WHERE u.role <> 'admin' AND a.owner <> u.name");
  }

  /** Lengkapi aplikasi dengan anggota tim dan spesifikasi (dipakai jenis Proyek). */
  async function withTeam(list) {
    if (!list.length) return list;
    const ids = list.map(app => app.id);
    const marks = ids.map(() => '?').join(', ');
    const members = await q(`SELECT app_id, user_id, is_lead FROM app_members WHERE app_id IN (${marks}) ORDER BY is_lead DESC, user_id`, ids);
    const specs = await q(`SELECT id, app_id, text, done FROM app_specs WHERE app_id IN (${marks}) ORDER BY position, id`, ids);
    const byId = Object.fromEntries(list.map(app => [app.id, app]));
    for (const m of members) byId[m.app_id].members.push({ userId: m.user_id, lead: Boolean(m.is_lead) });
    for (const s of specs) byId[s.app_id].specs.push({ id: s.id, text: s.text, done: Boolean(s.done) });
    return list;
  }
  const one = async row => (row ? (await withTeam([rowToApp(row)]))[0] : null);

  const users = {
    count: async () => (await q('SELECT COUNT(*) AS n FROM users'))[0].n,
    all: async () => (await q('SELECT * FROM users ORDER BY created_at, username')).map(rowToUser),
    byId: async id => rowToUser((await q('SELECT * FROM users WHERE id = ?', [id]))[0]),
    byUsername: async username => rowToUser((await q('SELECT * FROM users WHERE username = ?', [username]))[0]),
    activeAdmins: async excludeId => (await q("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id <> ?", [excludeId || '']))[0].n,
    async insert(user) {
      await q('INSERT INTO users (id, username, name, role, active, salt, hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [user.id, user.username, user.name, user.role, user.active ? 1 : 0, user.salt, user.hash]);
      return user;
    },
    async update(id, fields) {
      const allowed = ['name', 'role', 'active', 'salt', 'hash', 'photo', 'bio'].filter(key => key in fields);
      if (!allowed.length) return;
      // Ganti nama: nama pembuat di aplikasinya ikut diganti, supaya tetap terhubung ke profilnya.
      if ('name' in fields) {
        const old = (await q('SELECT name FROM users WHERE id = ?', [id]))[0];
        if (old && old.name !== fields.name) await q('UPDATE apps SET owner = ? WHERE created_by = ? AND owner = ?', [fields.name, id, old.name]);
      }
      await q(`UPDATE users SET ${allowed.map(key => `${key} = ?`).join(', ')} WHERE id = ?`,
        [...allowed.map(key => (key === 'active' ? (fields[key] ? 1 : 0) : fields[key])), id]);
    },
    remove: async id => q('DELETE FROM users WHERE id = ?', [id]),
  };

  const sessions = {
    insert: async session => q('INSERT INTO sessions (id, user_id, expires) VALUES (?, ?, ?)', [session.id, session.userId, session.expires]),
    async findUser(id, now = Date.now()) {
      const rows = await q('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires > ? AND u.active = 1', [id, now]);
      return rowToUser(rows[0]) || null;
    },
    remove: async id => q('DELETE FROM sessions WHERE id = ?', [id]),
    removeForUser: async (userId, keepId = '') => q('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [userId, keepId]),
    prune: async (now = Date.now()) => (await q('DELETE FROM sessions WHERE expires <= ?', [now])).affectedRows,
  };

  // Token API untuk AI agent (MCP). Yang disimpan hanya hash SHA-256.
  const rowToToken = row => ({ id: row.id, name: row.name, hint: row.hint, createdAt: iso(row.created_at), lastUsedAt: iso(row.last_used_at) });
  const tokens = {
    insert: async t => q('INSERT INTO api_tokens (id, user_id, name, token_hash, hint, created_at) VALUES (?, ?, ?, ?, ?, ?)', [t.id, t.userId, t.name, t.hash, t.hint, new Date()]),
    forUser: async userId => (await q('SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC', [userId])).map(rowToToken),
    count: async userId => (await q('SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?', [userId]))[0].n,
    async findUser(hash) {
      const rows = await q('SELECT u.*, t.id AS token_id FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND u.active = 1', [hash]);
      if (!rows[0]) return null;
      await q('UPDATE api_tokens SET last_used_at = ? WHERE id = ?', [new Date(), rows[0].token_id]);
      return rowToUser(rows[0]);
    },
    remove: async (id, userId) => (await q('DELETE FROM api_tokens WHERE id = ? AND user_id = ?', [id, userId])).affectedRows,
  };

  const apps = {
    all: async () => withTeam((await q('SELECT * FROM apps')).map(rowToApp)),
    active: async () => withTeam((await q('SELECT * FROM apps WHERE deleted_at IS NULL')).map(rowToApp)),
    trash: async () => withTeam((await q('SELECT * FROM apps WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')).map(rowToApp)),
    byId: async id => one((await q('SELECT * FROM apps WHERE id = ?', [id]))[0]),
    /** Ganti seluruh anggota tim: [{ userId, lead }]. */
    async setMembers(appId, members) {
      await q('DELETE FROM app_members WHERE app_id = ?', [appId]);
      for (const m of members) await q('INSERT INTO app_members (app_id, user_id, is_lead) VALUES (?, ?, ?)', [appId, m.userId, m.lead ? 1 : 0]);
    },
    /** Ganti seluruh spesifikasi: [{ id?, text, done }]. Urutan mengikuti array. */
    async setSpecs(appId, specs) {
      await q('DELETE FROM app_specs WHERE app_id = ?', [appId]);
      for (const [i, s] of specs.entries()) {
        await q('INSERT INTO app_specs (id, app_id, text, done, position) VALUES (?, ?, ?, ?, ?)', [s.id || crypto.randomUUID(), appId, s.text, s.done ? 1 : 0, i]);
      }
    },
    setSpecDone: async (appId, specId, done) => (await q('UPDATE app_specs SET done = ? WHERE id = ? AND app_id = ?', [done ? 1 : 0, specId, appId])).affectedRows,
    /** Nama aplikasi aktif unik tanpa membedakan huruf besar/kecil (dibandingkan di JS seperti versi lama). */
    async nameTaken(name, exceptId = '') {
      const lower = name.toLowerCase();
      const rows = await q('SELECT name FROM apps WHERE deleted_at IS NULL AND id <> ?', [exceptId]);
      return rows.some(row => row.name.toLowerCase() === lower);
    },
    async insert(app) {
      const { columns, values } = appValues(app);
      await q(`INSERT INTO apps (id, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`, [app.id, ...values]);
      return app;
    },
    async update(id, fields) {
      const { columns, values } = appValues(fields);
      if (!columns.length) return;
      await q(`UPDATE apps SET ${columns.map(column => `${column} = ?`).join(', ')} WHERE id = ?`, [...values, id]);
    },
    remove: async id => q('DELETE FROM apps WHERE id = ?', [id]),
  };

  const audit = {
    async add(actor, action, target, detail = '') {
      await q('INSERT INTO audit (id, at, user_id, user_name, action, target, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), new Date(), actor?.id || null, actor?.name || 'Sistem', action, String(target || '').slice(0, 255), detail]);
      // Simpan hanya AUDIT_LIMIT catatan terakhir.
      await pool.query('DELETE FROM audit WHERE seq <= (SELECT seq FROM (SELECT seq FROM audit ORDER BY seq DESC LIMIT 1 OFFSET ?) AS t)', [AUDIT_LIMIT]);
    },
    async recent(limit = 300) {
      const rows = await pool.query('SELECT * FROM audit ORDER BY seq DESC LIMIT ?', [limit]);
      return rows[0].map(row => ({
        id: row.id,
        at: iso(row.at),
        userId: row.user_id,
        userName: row.user_name,
        action: row.action,
        target: row.target,
        detail: row.detail || '',
      }));
    },
    async remove(id) {
      const [result] = await pool.query('DELETE FROM audit WHERE id = ?', [id]);
      return result.affectedRows;
    },
    async clear() {
      const [result] = await pool.query('DELETE FROM audit');
      return result.affectedRows;
    },
    /** Dipakai skrip migrasi: memasukkan catatan lama apa adanya. */
    insertRaw: async entry => q('INSERT INTO audit (id, at, user_id, user_name, action, target, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [entry.id || crypto.randomUUID(), toDate(entry.at) || new Date(), entry.userId || null, entry.userName || 'Sistem', entry.action || '', String(entry.target || '').slice(0, 255), entry.detail || '']),
  };

  return { pool, init, close: () => pool.end(), users, sessions, tokens, apps, audit, config };
}

module.exports = { createDb, configFromEnv };

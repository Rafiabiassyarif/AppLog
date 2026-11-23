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
    created_by CHAR(36) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3) NULL,
    deleted_by CHAR(36) NULL,
    KEY idx_apps_deleted (deleted_at),
    KEY idx_apps_created_by (created_by)
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
  createdBy: row.created_by,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  deletedAt: iso(row.deleted_at),
  deletedBy: row.deleted_by,
});

const APP_COLUMNS = {
  name: 'name', owner: 'owner', type: 'type', status: 'status', tech: 'tech', link: 'link',
  description: 'description', year: 'year', logo: 'logo', startDate: 'start_date', endDate: 'end_date',
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
    else if (key === 'startDate' || key === 'endDate') values.push(dateOrNull(value));
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
  }

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
      const allowed = ['name', 'role', 'active', 'salt', 'hash'].filter(key => key in fields);
      if (!allowed.length) return;
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

  const apps = {
    all: async () => (await q('SELECT * FROM apps')).map(rowToApp),
    active: async () => (await q('SELECT * FROM apps WHERE deleted_at IS NULL')).map(rowToApp),
    trash: async () => (await q('SELECT * FROM apps WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')).map(rowToApp),
    byId: async id => rowToApp((await q('SELECT * FROM apps WHERE id = ?', [id]))[0]) || null,
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
    /** Dipakai skrip migrasi: memasukkan catatan lama apa adanya. */
    insertRaw: async entry => q('INSERT INTO audit (id, at, user_id, user_name, action, target, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [entry.id || crypto.randomUUID(), toDate(entry.at) || new Date(), entry.userId || null, entry.userName || 'Sistem', entry.action || '', String(entry.target || '').slice(0, 255), entry.detail || '']),
  };

  return { pool, init, close: () => pool.end(), users, sessions, apps, audit, config };
}

module.exports = { createDb, configFromEnv };

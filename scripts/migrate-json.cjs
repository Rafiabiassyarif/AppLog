'use strict';

// Memindahkan data lama (data/registry.json) ke MySQL. Jalankan sekali saat server dihentikan.
// Pemakaian: node scripts/migrate-json.cjs [path/ke/registry.json]
// Database tujuan harus masih kosong; file JSON tidak diubah.
const fs = require('fs');
const path = require('path');
const { run } = require('./db-connect.cjs');

const file = path.resolve(process.argv[2] || process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'registry.json'));

/** Menormalkan data lama agar semua field yang dipakai versi ini selalu ada. */
function normalize(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const list = key => (Array.isArray(data[key]) ? data[key] : []);
  const users = list('users').map(user => ({
    ...user,
    active: typeof user.active === 'boolean' ? user.active : true,
    name: String(user.name || user.username || '').slice(0, 60),
  }));
  const apps = list('apps').map(app => {
    const result = { ...app };
    for (const field of ['name', 'owner', 'type', 'status', 'tech', 'link', 'description', 'year', 'logo', 'startDate', 'endDate']) {
      result[field] = app[field] == null ? '' : String(app[field]);
    }
    result.createdBy = app.createdBy || null;
    result.createdAt = app.createdAt || app.updatedAt || new Date(0).toISOString();
    result.updatedAt = app.updatedAt || result.createdAt;
    result.deletedAt = app.deletedAt || null;
    result.deletedBy = app.deletedBy || null;
    return result;
  });
  return { users, apps, sessions: list('sessions'), audit: list('audit') };
}

run(async db => {
  if (!fs.existsSync(file)) throw new Error(`File tidak ditemukan: ${file}`);
  const data = normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
  const [[{ n: existing }]] = await db.pool.query('SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM apps) AS n');
  if (existing) throw new Error('Database tujuan sudah berisi data. Migrasi dibatalkan agar data tidak tercampur.');

  try {
    for (const user of data.users) await db.users.insert(user);
    const userIds = new Set(data.users.map(user => user.id));
    const now = Date.now();
    let sessions = 0;
    for (const session of data.sessions) {
      if (session.expires > now && userIds.has(session.userId)) {
        await db.sessions.insert(session);
        sessions++;
      }
    }
    for (const app of data.apps) await db.apps.insert(app);
    for (const entry of data.audit) await db.audit.insertRaw(entry);
    console.log(`Selesai: ${data.users.length} akun, ${data.apps.length} aplikasi, ${sessions} sesi aktif, ${data.audit.length} riwayat dipindahkan dari ${file}.`);
  } catch (error) {
    // Database awalnya kosong, jadi aman dikosongkan lagi agar migrasi bisa diulang.
    for (const table of ['audit', 'sessions', 'apps', 'users']) await db.pool.query(`DELETE FROM ${table}`);
    throw new Error(`Migrasi gagal dan dibatalkan: ${error.message}`);
  }
});

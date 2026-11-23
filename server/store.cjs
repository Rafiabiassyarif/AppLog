'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUDIT_LIMIT = 1000;
const BACKUP_INTERVAL_MS = 10 * 60 * 1000;

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

/** Menormalkan data lama agar semua field yang dipakai versi ini selalu ada. */
function normalize(raw) {
  const db = raw && typeof raw === 'object' ? raw : {};
  db.users = Array.isArray(db.users) ? db.users : [];
  db.apps = Array.isArray(db.apps) ? db.apps : [];
  db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
  db.audit = Array.isArray(db.audit) ? db.audit : [];
  for (const user of db.users) {
    if (typeof user.active !== 'boolean') user.active = true;
    user.name = String(user.name || user.username || '');
  }
  for (const app of db.apps) {
    for (const field of ['name', 'owner', 'type', 'status', 'tech', 'link', 'description', 'year', 'logo', 'startDate', 'endDate']) {
      app[field] = app[field] == null ? '' : String(app[field]);
    }
    app.createdBy = app.createdBy || null;
    app.createdAt = app.createdAt || app.updatedAt || new Date(0).toISOString();
    app.updatedAt = app.updatedAt || app.createdAt;
    app.deletedAt = app.deletedAt || null;
    app.deletedBy = app.deletedBy || null;
  }
  return db;
}

/**
 * Penyimpanan JSON untuk satu proses server.
 * Setiap penulisan atomik (tmp + rename) dan snapshot backup dibuat berkala.
 */
function createStore(dataFile, { keepBackups = 30, backupDir = path.join(path.dirname(dataFile), 'backups') } = {}) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });

  const exists = fs.existsSync(dataFile);
  const db = normalize(exists ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : null);
  let lastBackup = 0;

  function backup(force = false) {
    if (!fs.existsSync(dataFile)) return;
    const now = Date.now();
    if (!force && now - lastBackup < BACKUP_INTERVAL_MS) return;
    lastBackup = now;
    fs.copyFileSync(dataFile, path.join(backupDir, `registry-${stamp()}.json`));
    const files = fs.readdirSync(backupDir).filter(name => /^registry-.*\.json$/.test(name)).sort();
    for (const old of files.slice(0, Math.max(0, files.length - keepBackups))) {
      fs.unlinkSync(path.join(backupDir, old));
    }
  }

  function persist() {
    backup();
    const tmp = `${dataFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, dataFile);
  }

  function audit(actor, action, target, detail = '') {
    db.audit.push({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      userId: actor?.id || null,
      userName: actor?.name || 'Sistem',
      action,
      target,
      detail,
    });
    if (db.audit.length > AUDIT_LIMIT) db.audit.splice(0, db.audit.length - AUDIT_LIMIT);
  }

  if (exists) backup(true);
  return { db, persist, audit, backupDir };
}

module.exports = { createStore, normalize };

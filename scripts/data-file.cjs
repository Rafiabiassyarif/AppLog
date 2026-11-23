'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalize } = require('../server/store.cjs');

function openData() {
  const file = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'registry.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = normalize(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
  return { file, db };
}

function saveData(file, db) {
  if (fs.existsSync(file)) {
    const backupDir = path.join(path.dirname(file), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(file, path.join(backupDir, `registry-${Date.now()}-script.json`));
  }
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(db, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

const randomPassword = () => `${crypto.randomBytes(9).toString('base64url')}-${crypto.randomInt(10, 99)}`;

module.exports = { openData, saveData, randomPassword };

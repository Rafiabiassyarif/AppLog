'use strict';

// Membuat akun dari terminal (langsung ke MySQL).
// Pemakaian: node scripts/create-account.cjs username admin|member Nama Lengkap
const crypto = require('crypto');
const { run, randomPassword } = require('./db-connect.cjs');

const [username, role = 'member', ...names] = process.argv.slice(2);
if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username || '') || !['admin', 'member'].includes(role)) {
  console.error('Pemakaian: node scripts/create-account.cjs username admin|member Nama Anggota');
  process.exit(1);
}

run(async db => {
  const lower = username.toLowerCase();
  if (await db.users.byUsername(lower)) {
    throw new Error('Username sudah ada; akun lama tidak diubah. Untuk reset password: node scripts/reset-password.cjs ' + lower);
  }
  const password = randomPassword();
  const salt = crypto.randomBytes(16).toString('hex');
  const account = {
    id: crypto.randomUUID(),
    username: lower,
    name: (names.join(' ') || username).slice(0, 60),
    role,
    active: true,
    salt,
    hash: crypto.scryptSync(password, salt, 64).toString('hex'),
  };
  await db.users.insert(account);
  await db.audit.add(null, 'user.create', lower, 'Dibuat dari terminal');
  console.log(JSON.stringify({ username: lower, password, role }));
});

'use strict';

// Reset password dari terminal, misalnya saat satu-satunya Admin lupa password.
// Pemakaian: node scripts/reset-password.cjs username
const crypto = require('crypto');
const { run, randomPassword } = require('./db-connect.cjs');

const username = String(process.argv[2] || '').toLowerCase();

run(async db => {
  const user = await db.users.byUsername(username);
  if (!user) throw new Error('Pemakaian: node scripts/reset-password.cjs username (akun harus sudah ada)');
  const password = randomPassword();
  const salt = crypto.randomBytes(16).toString('hex');
  await db.users.update(user.id, { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex'), active: true });
  await db.sessions.removeForUser(user.id);
  await db.audit.add(null, 'user.reset-password', username, 'Direset dari terminal');
  console.log(JSON.stringify({ username, password }));
});

'use strict';

const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const SESSION_MS = 8 * 60 * 60 * 1000;
const DUMMY_SALT = crypto.randomBytes(16).toString('hex');
const DUMMY_HASH = crypto.scryptSync('dummy-password', DUMMY_SALT, 64).toString('hex');

async function hashPassword(password, salt) {
  return (await scrypt(password, salt, 64)).toString('hex');
}

async function makeCredentials(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: await hashPassword(password, salt) };
}

/** Selalu menghitung scrypt, juga untuk user yang tidak ada, agar waktu respons sama. */
async function verifyPassword(user, password) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const salt = user ? user.salt : DUMMY_SALT;
  const expected = Buffer.from(user ? user.hash : DUMMY_HASH, 'hex');
  const actual = Buffer.from(await hashPassword(password, salt), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual) && Boolean(user);
}

function randomPassword() {
  return `${crypto.randomBytes(9).toString('base64url')}-${crypto.randomInt(10, 99)}`;
}

const tokenId = token => crypto.createHash('sha256').update(token).digest('hex');

/** Sesi disimpan di file data (hanya hash token), sehingga tetap berlaku setelah restart. */
function createSessions(store) {
  const { db } = store;

  function prune() {
    const now = Date.now();
    const before = db.sessions.length;
    db.sessions = db.sessions.filter(s => s.expires > now);
    return before !== db.sessions.length;
  }

  function create(userId) {
    prune();
    const token = crypto.randomBytes(32).toString('hex');
    db.sessions.push({ id: tokenId(token), userId, expires: Date.now() + SESSION_MS });
    store.persist();
    return token;
  }

  function find(token) {
    if (!token) return null;
    const id = tokenId(token);
    const session = db.sessions.find(s => s.id === id && s.expires > Date.now());
    if (!session) return null;
    const user = db.users.find(u => u.id === session.userId && u.active);
    return user ? { session, user } : null;
  }

  function destroy(token) {
    if (!token) return;
    const id = tokenId(token);
    db.sessions = db.sessions.filter(s => s.id !== id);
    store.persist();
  }

  function destroyForUser(userId, exceptToken) {
    const keep = exceptToken ? tokenId(exceptToken) : null;
    db.sessions = db.sessions.filter(s => s.userId !== userId || s.id === keep);
  }

  if (prune()) store.persist();
  return { create, find, destroy, destroyForUser, prune, maxAgeSeconds: SESSION_MS / 1000 };
}

/**
 * Pembatas login: hanya kegagalan yang dihitung.
 * Batas per kombinasi IP+username dan batas lebih longgar per IP.
 */
function createLoginLimiter({ windowMs = 15 * 60 * 1000, perAccount = 5, perIp = 30 } = {}) {
  const failures = new Map();

  function entry(key) {
    const now = Date.now();
    let item = failures.get(key);
    if (!item || item.until < now) {
      item = { count: 0, until: now + windowMs };
      failures.set(key, item);
    }
    return item;
  }

  function blocked(ip, username) {
    return entry(`acct:${ip}|${username}`).count >= perAccount || entry(`ip:${ip}`).count >= perIp;
  }

  function fail(ip, username) {
    entry(`acct:${ip}|${username}`).count++;
    entry(`ip:${ip}`).count++;
  }

  function success(ip, username) {
    failures.delete(`acct:${ip}|${username}`);
  }

  function prune() {
    const now = Date.now();
    for (const [key, item] of failures) if (item.until < now) failures.delete(key);
  }

  return { blocked, fail, success, prune };
}

module.exports = { makeCredentials, verifyPassword, randomPassword, createSessions, createLoginLimiter };

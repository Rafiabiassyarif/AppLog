'use strict';

/** Error yang aman ditampilkan ke pengguna, lengkap dengan status HTTP. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const badRequest = message => new HttpError(400, message);
const forbidden = message => new HttpError(403, message);
const notFound = message => new HttpError(404, message);
const conflict = message => new HttpError(409, message);

module.exports = { HttpError, badRequest, forbidden, notFound, conflict };

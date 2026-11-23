export const UNAUTHORIZED_EVENT = 'applog:unauthorized';

/**
 * Pembungkus fetch untuk API AppLog.
 * - Pesan error selalu berbahasa Indonesia, juga saat respons bukan JSON.
 * - Respons 401 memicu event global supaya aplikasi kembali ke halaman login.
 */
export async function api(url, { method = 'GET', body, notifyUnauthorized = true } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
  } catch {
    throw Object.assign(new Error('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.'), { status: 0 });
  }

  let data = null;
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    data = await response.json().catch(() => null);
  }

  if (!response.ok) {
    if (response.status === 401 && notifyUnauthorized) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    const message = data?.error || `Permintaan gagal (kode ${response.status}).`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  if (data === null) throw Object.assign(new Error('Respons server tidak dikenali.'), { status: response.status });
  return data;
}

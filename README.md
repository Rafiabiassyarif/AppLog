# AppLog

Workspace internal untuk pendataan aplikasi internal dan proyek personal anggota Kroombox. Frontend React 19 + Vite, backend Node.js (tanpa framework), database MySQL 8.

## Menjalankan

1. Buat database dan user khusus di MySQL (jangan pakai root):

```sql
CREATE DATABASE applog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'applog'@'localhost' IDENTIFIED BY 'ganti-password-kuat';
GRANT ALL PRIVILEGES ON applog.* TO 'applog'@'localhost';
```

2. Salin `.env.example` menjadi `.env`, lalu isi `DATABASE_URL`. Tabel dibuat otomatis saat server pertama kali jalan.

3. Jalankan:

```powershell
npm install
npm run build
npm start
```

Buka http://127.0.0.1:4173. `/` adalah landing page, `/login` form login, `/admin` dashboard Admin, `/user` dashboard anggota.

Saat pertama kali dijalankan tanpa akun, halaman login berubah menjadi **Siapkan workspace** untuk membuat Admin pertama. Langkah ini hanya bisa dilakukan dari komputer server (localhost) dan hanya sekali.

Untuk pengembangan, jalankan `npm start` dan `npm run dev` di dua terminal. Vite meneruskan `/api` ke backend.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm start` | Menjalankan server produksi (hanya dari komputer ini) |
| `npm run start:lan` | Menjalankan server yang bisa dibuka perangkat lain di jaringan; alamatnya dicetak di terminal |
| `npm run dev` | Server pengembangan Vite |
| `npm run build` | Build frontend ke `dist/` |
| `npm test` | Tes API dan logika frontend (node:test) |
| `npm run lint` | Pemeriksaan kode (ESLint) |
| `npm run create-account -- <username> <admin\|member> <Nama>` | Membuat akun dari terminal |
| `npm run reset-password -- <username>` | Reset password dari terminal (jika Admin lupa password) |
| `npm run migrate -- [path/registry.json]` | Memindahkan data versi lama (file JSON) ke MySQL |

Script akun menampilkan password acak satu kali. Semua script membaca koneksi database dari `.env`.

## Pengaturan (environment variable)

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | – | `mysql://user:password@host:3306/database`. Alternatif: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |
| `HOST` | `127.0.0.1` | Pakai `0.0.0.0` agar bisa diakses perangkat lain di jaringan |
| `PORT` | `4173` | Port server |
| `TRUST_PROXY` | – | `1` jika server berada di belakang reverse proxy (Nginx, Caddy, Cloudflare). IP klien dan HTTPS dibaca dari header `X-Forwarded-*` |
| `COOKIE_SECURE` | – | `1` untuk memaksa cookie `Secure` (wajib saat memakai HTTPS) |

Variabel bisa ditulis di file `.env` (contoh: `.env.example`). File `.env` berisi password database: jangan masukkan ke repository dan batasi izin bacanya.

Contoh akses dari perangkat lain di jaringan kantor:

```powershell
npm run start:lan
```

Tanpa HTTPS, password dikirim tanpa enkripsi di jaringan. Untuk akses di luar jaringan lokal, pasang reverse proxy dengan HTTPS lalu jalankan dengan `TRUST_PROXY=1`.

## Akun dan hak akses

- Tidak ada pendaftaran publik. Admin membuat akun lewat **Kelola akun**.
- Admin dapat mengubah nama dan peran, menonaktifkan, mereset password, dan menghapus akun. Admin tidak bisa menurunkan peran atau menonaktifkan akunnya sendiri, dan minimal satu Admin aktif selalu tersisa.
- User melihat aplikasi tim, menambah aplikasi, serta mengedit dan menghapus aplikasi buatannya sendiri. Nama pembuat diisi server.
- Password disimpan sebagai hash scrypt. Sesi berlaku 8 jam, tersimpan di database (tetap berlaku setelah server restart). Mengganti atau mereset password mengakhiri sesi lain.
- Login dibatasi: 5 percobaan gagal per username per IP dan 30 per IP dalam 15 menit.

## Data, Sampah, dan riwayat

- Aplikasi yang dihapus masuk **Sampah** dan bisa dipulihkan. Hanya Admin yang dapat menghapus permanen.
- **Riwayat perubahan** (Admin) mencatat siapa mengubah apa dan kapan (1000 catatan terakhir).
- Ekspor XLSX dan PDF mengikuti pencarian, filter, dan urutan yang sedang dipakai.
- Backup database dengan `mysqldump`, sebaiknya terjadwal (cron) dan disimpan di disk atau server lain:

```bash
mysqldump --single-transaction -u applog -p applog > applog-$(date +%F).sql
```

- Memulihkan backup: `mysql -u applog -p applog < applog-2026-11-23.sql`.

## Pindah dari versi JSON

Versi lama menyimpan data di `data/registry.json`. Untuk memindahkan semua akun, aplikasi, sesi, dan riwayat:

1. Hentikan server.
2. Siapkan database kosong dan `.env` (lihat **Menjalankan**).
3. Jalankan `npm run migrate` (atau `npm run migrate -- /path/ke/registry.json`).
4. Jalankan server lagi. Login lama tetap berlaku.

Migrasi menolak berjalan jika database sudah berisi data. File JSON tidak diubah; simpan sebagai cadangan.

## Keamanan

Server mengirim Content-Security-Policy, X-Frame-Options, dan header keamanan lain. Permintaan selain GET harus berformat JSON dan permintaan lintas situs ditolak. Cookie sesi bersifat HttpOnly dan SameSite=Strict. Pesan error internal tidak dikirim ke browser.

Saat di-hosting: jalankan Node di `127.0.0.1` di belakang reverse proxy HTTPS dengan `TRUST_PROXY=1`, jangan buka port MySQL (3306) ke internet, dan pakai user MySQL khusus yang hanya punya akses ke database AppLog.

## Struktur

- `server.cjs`: titik masuk server.
- `server/app.cjs`: routing API dan file statis.
- `server/auth.cjs`: password, sesi, pembatasan login.
- `server/db.cjs`: koneksi MySQL, pembuatan tabel, query.
- `server/validate.cjs`, `server/query.cjs`, `server/export.cjs`: validasi, filter/urutan, ekspor.
- `src/main.jsx`: titik masuk frontend. `src/App.jsx`, `src/Login.jsx`, `src/Workspace.jsx`, `src/views/`: halaman.
- `src/lib/`: pemanggil API, format, filter.
- `src/app.css`: seluruh gaya. Font di-host sendiri lewat `@fontsource-variable`.
- `tests/`: tes. Tes API butuh MySQL: `$env:TEST_MYSQL_URL = 'mysql://root@127.0.0.1:3306'; npm test` (memakai database sementara yang dihapus setelah selesai).
- `scripts/`: pengelolaan akun dan migrasi data dari terminal.

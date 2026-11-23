# AppLog

Workspace internal untuk pendataan aplikasi internal dan proyek personal anggota Kroombox. Frontend React 19 + Vite, backend Node.js (tanpa framework), penyimpanan file JSON.

## Menjalankan

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
| `node scripts/create-account.cjs <username> <admin\|member> <Nama>` | Membuat akun dari terminal |
| `node scripts/reset-password.cjs <username>` | Reset password dari terminal (jika Admin lupa password) |

Script terminal menampilkan password acak satu kali dan membuat backup data sebelum menyimpan. Jalankan saat server dihentikan.

## Pengaturan (environment variable)

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Pakai `0.0.0.0` agar bisa diakses perangkat lain di jaringan |
| `PORT` | `4173` | Port server |
| `DATA_FILE` | `data/registry.json` | Lokasi file data |
| `BACKUP_DIR` | `data/backups` | Lokasi backup otomatis. Sebaiknya di disk lain atau folder yang disinkronkan (OneDrive, Google Drive) |
| `TRUST_PROXY` | – | `1` jika server berada di belakang reverse proxy (Nginx, Caddy, Cloudflare). IP klien dan HTTPS dibaca dari header `X-Forwarded-*` |
| `COOKIE_SECURE` | – | `1` untuk memaksa cookie `Secure` (wajib saat memakai HTTPS) |

Contoh akses dari perangkat lain di jaringan kantor:

```powershell
npm run start:lan
```

Tanpa HTTPS, password dikirim tanpa enkripsi di jaringan. Untuk akses di luar jaringan lokal, pasang reverse proxy dengan HTTPS lalu jalankan dengan `TRUST_PROXY=1`.

## Akun dan hak akses

- Tidak ada pendaftaran publik. Admin membuat akun lewat **Kelola akun**.
- Admin dapat mengubah nama dan peran, menonaktifkan, mereset password, dan menghapus akun. Admin tidak bisa menurunkan peran atau menonaktifkan akunnya sendiri, dan minimal satu Admin aktif selalu tersisa.
- User melihat aplikasi tim, menambah aplikasi, serta mengedit dan menghapus aplikasi buatannya sendiri. Nama pembuat diisi server.
- Password disimpan sebagai hash scrypt. Sesi berlaku 8 jam, tersimpan di file data (tetap berlaku setelah server restart). Mengganti atau mereset password mengakhiri sesi lain.
- Login dibatasi: 5 percobaan gagal per username per IP dan 30 per IP dalam 15 menit.

## Data, Sampah, dan riwayat

- Aplikasi yang dihapus masuk **Sampah** dan bisa dipulihkan. Hanya Admin yang dapat menghapus permanen.
- **Riwayat perubahan** (Admin) mencatat siapa mengubah apa dan kapan (1000 catatan terakhir).
- File data ditulis secara atomik. Backup otomatis disimpan di `data/backups/` atau `BACKUP_DIR` (maksimal satu per 10 menit, 30 terakhir disimpan). Jangan masukkan folder `data/` ke repository. Simpan backup di disk lain agar data selamat bila disk utama rusak, misalnya:

```powershell
$env:BACKUP_DIR = 'E:\Backup\AppLog'; npm start
```

- Ekspor XLSX dan PDF mengikuti pencarian, filter, dan urutan yang sedang dipakai.

## Keamanan

Server mengirim Content-Security-Policy, X-Frame-Options, dan header keamanan lain. Permintaan selain GET harus berformat JSON dan permintaan lintas situs ditolak. Cookie sesi bersifat HttpOnly dan SameSite=Strict. Pesan error internal tidak dikirim ke browser.

## Struktur

- `server.cjs`: titik masuk server.
- `server/app.cjs`: routing API dan file statis.
- `server/auth.cjs`: password, sesi, pembatasan login.
- `server/store.cjs`: penyimpanan JSON, backup, riwayat.
- `server/validate.cjs`, `server/query.cjs`, `server/export.cjs`: validasi, filter/urutan, ekspor.
- `src/main.jsx`: titik masuk frontend. `src/App.jsx`, `src/Login.jsx`, `src/Workspace.jsx`, `src/views/`: halaman.
- `src/lib/`: pemanggil API, format, filter.
- `src/app.css`: seluruh gaya. Font di-host sendiri lewat `@fontsource-variable`.
- `tests/`: tes API.
- `scripts/`: pengelolaan akun dari terminal.

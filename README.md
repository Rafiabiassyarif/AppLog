# AppLog

Workspace internal untuk pendataan aplikasi internal dan proyek personal anggota. Frontend React 19 + Vite, backend Node.js, penyimpanan JSON pada server lokal.

## Menjalankan

```powershell
npm install
npm run build
npm start
```

Buka http://127.0.0.1:4173 untuk landing page AppLog. /login membuka form login, /admin dashboard Admin, dan /user dashboard anggota. Landing page tetap tampil di / meskipun sudah login. Frontend produksi dilayani oleh server Node yang sama.

Untuk pengembangan, jalankan `npm start` dan `npm run dev` pada dua terminal. Vite meneruskan /api ke backend.

## Akun dan hak akses

Login hanya memiliki username dan password. Tidak ada pendaftaran publik. Admin mengelola seluruh aplikasi dan membuat akun User lewat Kelola akun. User melihat aplikasi tim, menambah aplikasi, serta mengedit/menghapus aplikasi yang dibuat sendiri. Identitas pembuat ditentukan server.

Pembuatan akun dari terminal (jalankan saat server dihentikan):

```powershell
node scripts/create-account.cjs namauser member Nama Anggota
node scripts/create-account.cjs namaadmin admin Nama Admin
```

Script menampilkan password acak satu kali dan tidak menimpa akun lama. Password bisa diganti dari sidebar. Password disimpan sebagai hash scrypt; session cookie HttpOnly berlaku delapan jam. Restart server mengakhiri sesi login.

## Data dan laporan

Backup `data/registry.json` untuk menjaga data akun dan aplikasi. Jangan masukkan folder data ke repository publik. Data lama tetap kompatibel; aplikasi tanpa identitas pembuat hanya dapat diubah Admin. Data browser versi pertama tidak dimigrasi otomatis.

Ekspor XLSX asli memiliki judul, header berwarna, lebar kolom, wrap text, filter, freeze pane, dan pengaturan cetak landscape. PDF juga diunduh sebagai file langsung. Ekspor mengikuti pencarian, filter jenis/status dan halaman Aplikasi saya.

## Struktur

- `src/main.jsx`: UI React, dashboard, akun, form, dan login.
- `src/style.css`: desain AppLog dan layout responsif.
- `public/logo.svg`: logo dan favicon AppLog.
- `server.cjs`: autentikasi, API, penyimpanan, ekspor dan file frontend.
- `scripts/create-account.cjs`: membuat akun melalui terminal.
- `dist/`: hasil build produksi.

Server terikat ke 127.0.0.1 untuk pemakaian lokal. Akses antarperangkat membutuhkan deployment dan konfigurasi HTTPS. Penyimpanan JSON ditujukan untuk satu proses server.

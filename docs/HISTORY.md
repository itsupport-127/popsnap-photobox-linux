# Riwayat pengerjaan

Terbaru di atas. Format entri: tanggal, repo, apa yang diubah, cara uji, status penerapan.
"Status" ditulis jujur: *diserahkan sebagai zip* berarti pemilik yang memasangnya; cek `git log` untuk memastikan sudah masuk repo.

---

## 2026-11-23 (2) | popsnap-photobox-linux | Paket Linux: uji, perbaikan, dokumentasi
Kerangka paket Linux (`linux/`) sudah ada dari sesi lain (kiosk Chrome, systemd, .deb, install.sh, doctor, `POPSNAP_FRONTEND`). Sesi ini **tidak membuat ulang**, hanya menguji dan memperbaiki.
- Diuji nyata di sandbox Ubuntu 24.04: build `.deb` + `.tar.gz`; `dpkg -i` (pasang), update 1.0.0 -> 1.0.1 (database dicadangkan ke `/var/lib/popsnap/backup/sebelum-update-*`, data utuh), downgrade **ditolak** (deb dan tar), `dpkg -r` dan `install.sh --uninstall` (data tetap), layanan jalan sebagai user `popsnap`, `/`, `/admin`, rute React dilayani, `systemd-analyze verify` lulus, Chrome + webcam palsu: layar Start tampil dan `getUserMedia` jalan, tanpa error konsol.
- Bug diperbaiki: (1) `install.sh` di dalam tar.gz tidak punya izin eksekusi (berkas dibuat dari Windows) -> `chmod` di `build-linux.sh` dan bit eksekusi di git; (2) berkas aset yang tidak ada (`/assets/x.js`) dibalas `index.html` 200, kini 404 (`server.js`, fallback SPA melewati path berekstensi); (3) `install.sh` kini `chown -R` folder data; (4) `popsnap-doctor`: peringatan browser versi snap, tidak salah memperingatkan grup video saat dijalankan sebagai root.
- Dokumen baru: `docs/` (README, HISTORY, APP-FLOW, LINUX-STATUS).
- **Belum diuji**: kamera DSLR, kamera webcam fisik, printer CUPS, layar penuh kiosk di desktop asli, systemd sungguhan (sandbox tanpa systemd aktif). Lihat `LINUX-STATUS.md`.
- Status: dikerjakan di salinan lokal; belum di-push (sesi tanpa akses tulis).

## 2026-11-23 (1) | popsnap-photobox | Logo & nama aplikasi bisa diubah
- Pengaturan baru `display.brand {logo, name}` (bawaan kosong dan POPSNAP). Kartu "Logo & nama aplikasi" di Admin > Tampilan. Dipakai di layar Start, template, pembayaran, sesi foto, pengingat, notifikasi strip, login, menu admin; juga judul jendela.
- Berkas: `backend/settings.js`, `backend/server.js` (alamat logo publik), `frontend/src/state/brand.js`, `components/BrandLogo.jsx`, `admin/settings/SettingsDisplay.jsx`, dll. Tes: `backend/test/brand-settings.js`.
- Perlu build ulang frontend (`build-exe.bat`). Nama installer tidak berubah (disengaja).
- Status: diserahkan sebagai `popsnap-photobox-logo.zip`; tampaknya sudah dipasang pemilik (repo linux memuatnya).

## 2026-11-23 | popsnap-gallery | Filter tanggal di daftar link, perbaikan unduh semua
- Admin galeri > Link pelanggan: kolom Dari/Sampai tanggal (jam perangkat), tombol Hari ini/Kemarin/7 hari/30 hari/Semua; param server `from`/`to` (ms). Perbaikan: pilihan cepat dihitung ulang tiap muat (tidak basi lewat tengah malam), dari>sampai ditukar otomatis, tahun <100 aman.
- Halaman tamu: tombol "All Photo" memicu unduhan beruntun; browser kadang menahan satu file dan halaman tidak bisa tahu mana yang gagal. Pesan diperjelas ("dikirim N permintaan, cek folder Unduhan"), jeda 1,8 dtk. Solusi pasti: mode ZIP.
- Status: diserahkan sebagai `popsnap-gallery-filter-tanggal.zip` dan `popsnap-gallery-unduh.zip`.

## 2026-11-22/23 | popsnap-photobox | GIF/Live/klip hilang saat aplikasi restart
- Gejala: sesi PB-1990-261122-0008 hanya punya 1 hasil + 8 mentah, tanpa GIF/Live/klip. Log: backend restart 07:36 UTC (14.36 WIB), ~6 menit setelah sesi, tanpa error sebelumnya.
- Sebab: kunci unggah sesi (`uploadKey`) hanya di memori; setelah restart unggahan susulan ditolak 403.
- Perbaikan: kunci di tabel `session_upload_keys`, dibersihkan 24 jam; penolakan dicatat dengan alasan. Tes `backend/test/session-key-restart.js` (gagal di kode lama, lulus di kode baru).
- Belum tertutup: aplikasi yang ditutup paksa di tengah pembuatan GIF/Live tetap menghentikan pembuatannya.
- Status: diserahkan sebagai `popsnap-photobox-fix.zip`.

## 2026-11 | popsnap-photobox + popsnap-remote | Rangkaian pekerjaan Remote
Urutan pekerjaan (semua diserahkan sebagai zip, tiap kali diuji end-to-end dengan server sungguhan):
1. Penyebab klip terlalu terang (latar pink): profil Live ~2,3 stop lebih terang dari Foto; solusi: turunkan Live brightness/ISO. Kini bisa diatur dari Remote.
2. Tampilan Remote bertema admin photobox, pengaturan dikelompokkan seperti menu Settings, semua pengaturan boleh dikontrol kecuali: sinkron layanan lain, rahasia, PIN, folder, nama perangkat, unggahan. Semua Alat diekspos. (`popsnap-remote/src/spec.js`, 162 opsi.)
3. Auto ISO: pengguna memilih mengatur semuanya dari Remote (profil kamera, jadwal).
4. Keamanan ubah pengaturan saat sesi foto: perubahan kamera ditolak saat sesi/jepret; opsi "terapkan setelah sesi selesai" (`whenIdle`, TTL 30 menit).
5. Alat **Log aplikasi** (`backend/appLog.js`): pilih tanggal, rentang jam, level, kata kunci; dibaca bertahap; sensor rahasia; 14 hari.
6. Tinjauan bug lalu perbaikan batasan: umpan balik hasil perintah, pembacaan log ringan, editor profil kamera dan jadwal.
7. Banner jika app booth belum diperbarui (booth lama tidak mengirim `general.flow.steps`).
- Penerapan di VPS: `git pull` / unzip lalu `docker compose up -d --build` (container `popsnap-remote`, `/opt/popsnap-remote`, nginx 8643 + Let's Encrypt, DuckDNS `remote-popsnap.duckdns.org`).

## Awal | popsnap-remote | Deploy
Remote di https://remote-popsnap.duckdns.org:8643 (Docker di 127.0.0.1:8091, nginx 8643, certbot standalone port 80). Skrip DuckDNS dan peta port VPS dihormati. Sertifikat popsnap-kasir kedaluwarsa dan aplikasi lain di VPS **tidak disentuh** (peringatan sudah disampaikan ke pemilik; reboot kernel VPS juga tertunda).

---
### Cara menambah entri
Tambahkan blok baru di atas garis pertama: tanggal, repo, apa/kenapa, cara uji, status penerapan, dan hal yang belum teruji.

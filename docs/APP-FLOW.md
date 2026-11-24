# Alur dan isi aplikasi POPSNAP

Disusun dari kode (bukan dari ingatan). Kalau kode berubah, perbarui bagian terkait. Terakhir diverifikasi: 2026-11-23.

## 1. Gambaran besar
```
Layar booth (React, frontend/)  <--HTTP-->  Backend Node (backend/server.js, port 4000)  <--> SQLite + folder data
      |                                           |-- kamera: webcam (browser) | DSLR via program perantara Windows (.exe) atau gPhoto2 (Linux)
      |                                           |-- Remote Booth (poll ke popsnap-remote)
      |                                           |-- Galeri (unggah sesi ke popsnap-gallery)
      |                                           `-- Kasir (API key), Midtrans/DOKU (QRIS), cloud-dashboard (opsional)
Windows: Electron (electron/) memuat frontend dari file dan menjalankan backend.
Linux  : backend sebagai layanan systemd menyajikan frontend, Chrome kiosk membukanya (folder linux/).
```
- Port tetap **4000**. Frontend memanggil `http://localhost:4000` (konstanta `API_BASE`, ditanam saat build).
- Endpoint **kiosk** (kamera, voucher, sesi, pembayaran QRIS, catat cetak) hanya dilayani dari PC booth sendiri (loopback); perangkat lain di WiFi ditolak, kecuali `POPSNAP_ALLOW_LAN=1`. Tautan unduh tamu (`/s/...`, `/uploads`) terbuka ke LAN.
- Backend menyajikan frontend hanya bila `POPSNAP_FRONTEND` diisi (mode Linux/browser). Windows .exe dan mode dev (vite, port 5173) tidak memakainya.

## 2. Alur tamu di layar booth (`frontend/src/state/sessionMachine.js`, `screens/`)
```
WELCOME -> [DISCLAIMER (opsional)] -> TEMPLATE_CATEGORY -> TEMPLATE_SELECT -> PAYMENT
        -> [CONSENT (opsional)] -> [REMINDER (opsional)] -> PHOTO_SESSION | MEDIA_CAPTURE
        -> EDITOR -> RESULT -> kembali WELCOME
```
| Layar | Berkas | Isi |
|---|---|---|
| WELCOME | `WelcomeScreen.jsx` | Logo (bisa diganti di Admin), tombol START, status kamera, gembok PIN |
| DISCLAIMER | `DisclaimerScreen.jsx` | Persetujuan ketentuan (Admin > Umum) |
| TEMPLATE_CATEGORY / TEMPLATE_SELECT | `TemplateScreen.jsx` | Pilih kategori lalu template (mode "favorit" hanya template berbintang) |
| PAYMENT | `PaymentScreen.jsx` | QRIS (Midtrans/DOKU), voucher, atau gratis; diskon |
| CONSENT | `ConsentScreen.jsx` | Izin dipakai di sosmed |
| REMINDER | `ReminderScreen.jsx` | Layar pengingat sebelum sesi |
| PHOTO_SESSION | `PhotoSessionScreen.jsx` | Hitung mundur, jepret `totalShots` foto (bawaan 8), ulang foto sampai `maxRetakes`, live view; klip dari live view |
| MEDIA_CAPTURE | `MediaCaptureScreen.jsx` | Sesi GIF / Boomerang / Video |
| EDITOR | `EditorScreen.jsx` | Filter, stiker, pilih foto ke slot template |
| RESULT | `ResultScreen.jsx` | Hasil akhir, QR unduh, cetak, GIF/Live dibuat di sini |
Hook penting: `useCamera`, `useCameraStatus`, `useShotSequence`, `useClipRecorder`, `useKiosk`, `useRemoteLink`.
Gembok pojok (PIN) tersedia di semua layar; membuka admin membatalkan sesi yang sedang jalan (ada konfirmasi).

## 3. Alur data sesi (penting untuk galeri/unduhan)
1. Layar hasil memanggil `POST /api/session/finish` (foto hasil + semua foto mentah). Respons membawa `uploadKey`.
2. Susulan, memakai kunci itu: `POST /api/session/shots` (mentah), `/media` (GIF/Live), `/clip` (klip). Tanpa kunci valid: **403**.
3. Kunci disimpan di tabel `session_upload_keys` (database), jadi **bertahan setelah aplikasi restart** (dulu di memori sehingga restart di tengah sesi membuat GIF/klip hilang; lihat HISTORY 2026-11-22). Kunci kedaluwarsa dibersihkan per jam, 24 jam.
4. Penolakan tercatat di log: `[upload] <foto mentah|GIF/Live|klip> DITOLAK sesi <id>: <alasan>`.
5. `gallerySync.js` mengirim sesi ke galeri; galeri menghasilkan link `/s/<token>`, kode, dan masa berlaku.
6. Arsip permanen: `<data>/output` (tidak pernah dihapus otomatis). Sementara: `<data>/uploads` (dihapus setelah `fileRetentionDays`, 7 hari).

## 4. Admin (`/admin`, `frontend/src/admin/AdminApp.jsx`)
Login + peran/izin (tabel `users`, JWT). Rute dan izin:
| Rute | Halaman | Izin |
|---|---|---|
| `/admin` | AdminHome | login |
| `template` | TemplateSlotEditor (editor slot) | template.manage |
| `stickers`, `filters` | Stiker, Filter | template.manage / settings.manage |
| `check` | ReadyCheckPage (cek kesiapan booth) | settings.manage |
| `social` | SocialPage (folder/izin sosmed) | settings.manage |
| `payment` | PaymentPage (mode, gateway) | payment.mode / payment.gateway |
| `voucher` | VoucherPage | voucher.manage |
| `settings` | SettingsPage (lihat bagian 6) | settings.manage |
| `tools/camera` | CameraSettingsPage (setelan DSLR, exposure, jadwal) | settings.manage |
| `flow` | FlowPage (urutan alur sesi) | settings.manage |
| `remote` | RemotePage (sambung ke Remote) | settings.manage |
| `tools` | ToolsPage (penyimpanan, arsip, file yatim) | tools.maintenance |
| `users`, `activity` | Pengguna, Log aktivitas | users.manage / activity.view |
| `account`, `help` | Akun saya, Bantuan | login |
Kasir: `CashierScreen.jsx`.

## 5. Backend (`backend/`)
| Berkas | Peran |
|---|---|
| `server.js` | Semua rute HTTP, sesi, pembayaran, cetak, penyajian frontend (opsional), alat (storage/arsip/yatim/log) |
| `config.js` | Port, `POPSNAP_DATA`, `POPSNAP_LIBRARY`, `OUTPUT_DIR`, `PUBLIC_HOST`, Midtrans; membaca `.env` di folder data |
| `db.js` | SQLite bawaan Node (`node:sqlite`), migrasi hanya menambah kolom |
| `settings.js` | Skema + validasi ketat semua pengaturan (nilai tak valid kembali ke nilai sekarang), `load/update/forKiosk` |
| `auth.js`, `activity.js` | Login, izin, log aktivitas |
| `gphotoBridge.js` | Kamera DSLR di Linux: membungkus `gphoto2` (live view `--capture-movie`, jepret, baca/ubah setelan). Satu proses pemegang USB, antrean `exclusive()`. Tes: `test/gphoto-bridge.js`, `test/gphoto-http.js` (pakai `test/fixtures/fake-gphoto2.js`) |
| `cameraBridge.js`, `nativeBridge.js`, `sdkBridge.js` | Kamera DSLR: program perantara Windows (`popsnap_canon_bridge.exe`, `popsnap_nikon_bridge.exe`, `*_sdk_bridge.exe`), exposure, live view |
| `remoteAgent.js`, `remoteSpec.js` | Agen Remote: kirim pengaturan tiap 8 dtk, terima perintah. `remoteSpec.js` = salinan persis `popsnap-remote/src/spec.js` |
| `gallerySync.js`, `sharePage.js` | Unggah ke galeri, halaman `/s/:token` |
| `appLog.js` | Log per hari `<data>/logs/app-YYYY-MM-DD.log` (14 hari, sensor rahasia), dibaca alat "Log aplikasi" di Remote |
| `library.js` | Cermin Settings + Templates ke folder pustaka yang bisa dibuka di File Explorer |
| `doku.js`, `cloudSync.js` | DOKU, sinkron ringkasan ke dashboard pusat (opsional) |
Kelompok API utama: `/api/templates`, `/api/categories`, `/api/stickers`, `/api/settings`, `/api/session/*`, `/api/payment/*`, `/api/voucher/*`, `/api/camera/*`, `/api/print/*`, `/api/storage/*`, `/api/system/*`, `/api/auth/*`, `/api/admin/activity`, `/api/integration/*` (kasir), `/api/remote/config`, `/api/gallery/*`, `/api/library/sync`.
Tabel database: `templates, categories, stickers, sticker_categories, sessions, session_files, session_upload_keys, payments, vouchers, tx_log, users, store_settings, app_settings, activity_log, print_jobs`.

## 6. Pengaturan (`backend/settings.js`, disimpan di `app_settings`)
Kunci tingkat atas: `event, general, printing, camera, editor, display, gif, result, animated, boomerang, video, session, payment`.
- `display.brand {logo, name}`: logo dan nama aplikasi (bawaan POPSNAP). Admin > Pengaturan > Tampilan > "Logo & nama aplikasi". Dipakai semua layar lewat `frontend/src/state/brand.js` dan `components/BrandLogo.jsx`.
- `camera`: mode (webcam/dslr), `exposure {split, live, photo}` dan `exposureSchedule {enabled, periods}` (profil Canon/Nikon; klip memakai profil Live).
- `result` / `animated`: GIF, Live, klip (`liveBrightness`, `liveContrast`, `liveSharpness`).
- Halaman pengaturan dikelompokkan di `frontend/src/admin/SettingsPage.jsx` (Umum, Cetak, Kamera, Tampilan, Media, Filter).

## 7. Remote Booth
Booth memanggil `popsnap-remote` (`/api/agent/hello`, `/poll`, `/ack`). Remote menampilkan dan mengubah pengaturan memakai spesifikasi `spec.js` (162 opsi; tipe: bool, int, num, text, textarea, color, enum, steps, profile, periods). Perintah: `settings.patch` (bisa "terapkan setelah sesi selesai"), alat (`tools.storage`, `tools.archive_cleanup`, `tools.cleanup_orphans`, `camera.status`, `camera.exposure.get/set`, `logs.read`). Perubahan kamera ditolak saat sesi jalan atau sedang jepret.

## 8. Lokasi data
| | Windows (.exe) | Linux (paket) |
|---|---|---|
| Aplikasi | `C:\Program Files\POPSNAP` | `/opt/popsnap` |
| Data | `%AppData%\POPSNAP` | `/var/lib/popsnap` |
| Pustaka | `Pictures\POPSNAP` | `/var/lib/popsnap/library` |
| Rahasia `.env` | `%AppData%\POPSNAP\.env` | `/var/lib/popsnap/.env` (600) |
| Log | `<data>\logs` | `<data>/logs` dan `journalctl -u popsnap` |

## 9. Build, tes, rilis
- Windows: `build-exe.bat` (frontend dengan `POPSNAP_EXE=1`, base `./`, lalu electron-builder). Dev: `start-popsnap.bat` / `start-popsnap.sh` (vite 5173 + backend 4000).
- Linux: `linux/build-linux.sh` menghasilkan `.deb` dan `.tar.gz` di `linux/dist/` (Node ikut dibundel).
- Tes: `backend/test/*.js` (diskon, mode gratis, kasir, folder sosmed, storage, kunci sesi setelah restart, merek). CI: `.github/workflows/test.yml`. E2E: `e2e/`.

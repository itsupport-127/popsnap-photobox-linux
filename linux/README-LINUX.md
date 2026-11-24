# POPSNAP di Linux (Chrome kiosk)

Mode ini menjalankan **backend sebagai layanan systemd** dan **tampilan booth di Chrome/Chromium layar penuh**.
Aplikasi desktop (.exe / Electron) tidak dipakai di Linux.

> Belum diuji di PC booth Linux sungguhan (kamera, printer, layar penuh). Uji dulu di satu booth.

## Yang didukung / tidak
- Didukung: webcam, template, QRIS, galeri, kasir, Remote, admin, cetak lewat CUPS.
- **DSLR/mirrorless:** lewat gPhoto2 (lihat bagian *Kamera DSLR* di bawah). Baru diuji dengan gphoto2 tiruan, belum dengan kamera asli.
- **Tidak didukung:** SDK Canon/Nikon bawaan Windows, digiCamControl, dslrBooth, Canon Auto Exposure live view boost, cetak ke `\\PC\printer`.
- Kunci layar penuh di Chrome tidak serapat aplikasi .exe (Esc bisa ditahan ±2 detik untuk keluar). Untuk kunci rapat, jalankan di sesi kiosk khusus.

## Pasang
Pilih satu (hasilnya sama):

**.deb (Debian/Ubuntu)**
```
sudo apt install ./popsnap_1.0.0_amd64.deb
```

**.tar.gz**
```
tar xzf popsnap-1.0.0-linux-amd64.tar.gz && cd popsnap-1.0.0-linux-amd64
sudo ./install.sh
```

Lalu: `popsnap-doctor` (cek kesiapan), pasang Chrome/Chromium kalau belum, dan login ke desktop. Kiosk terbuka otomatis; manual: `popsnap-kiosk`.
Buka `http://localhost:4000/admin` untuk setup akun pertama.

## Lokasi
| Apa | Dimana | Dihapus saat update/hapus? |
|---|---|---|
| Aplikasi | `/opt/popsnap` | diganti saat update |
| Data (database, upload, arsip, pustaka, `.env`) | `/var/lib/popsnap` | **tidak pernah** |
| Pengaturan peluncur | `/etc/popsnap/popsnap.conf` | tidak ditimpa |
| Rahasia (kunci pembayaran/token) | `/var/lib/popsnap/.env` (`chmod 600`) | tidak |
| Cadangan sebelum update | `/var/lib/popsnap/backup/sebelum-update-…` | tidak |

## Update
Pasang paket versi baru dengan cara yang sama. Layanan dihentikan, database dicadangkan, aplikasi diganti, layanan jalan lagi.
Versi yang lebih lama dari yang terpasang ditolak (kecuali `POPSNAP_ALLOW_DOWNGRADE=1`).

## Hapus
`sudo apt remove popsnap` atau `sudo ./install.sh --uninstall`. Data di `/var/lib/popsnap` tetap ada.

## Perintah berguna
```
popsnap-doctor                     # cek semua
sudo systemctl status popsnap      # status layanan
journalctl -u popsnap -f           # log
popsnap-kiosk --stop               # tutup kiosk (tidak dibuka ulang)
```

## Pengaturan kiosk (`/etc/popsnap/popsnap.conf`)
`KIOSK_AUTO_CAMERA=1` izin kamera otomatis · `KIOSK_SILENT_PRINT=1` cetak langsung ke printer bawaan CUPS ·
`CHROME_BIN` pilih browser · `PUBLIC_HOST` kalau alamat LAN yang terdeteksi salah. **Port tetap 4000.**
Pengguna desktop booth sebaiknya masuk grup `video`: `sudo usermod -aG video NAMA_USER`.

## Membuat paket sendiri (di mesin Linux)
```
linux/build-linux.sh [--version 1.0.0] [--node /path/node]
```
Hasil di `linux/dist/`. Node ikut dibundel; butuh Node 22.5+, npm, dpkg-deb.

## Build
Di mesin Linux (Node 22.5+): `./build-linux.sh 1.1.0` -> hasil di `linux/dist/` (.deb + .tar.gz + SHA256SUMS).

## Build dari Windows
`build-linux.bat 1.1.0` (butuh Docker Desktop, atau WSL dengan Node 22.5+ dan dpkg-deb). Memakai salinan bersih repo (tanpa node_modules Windows, CRLF dibersihkan). Hasil di `linux\dist\`.

## Kamera DSLR (gPhoto2)
1. `sudo apt install gphoto2` (paket .deb merekomendasikannya otomatis). Pemasang sudah memasang aturan udev dan mematikan gvfs kamera.
2. Hidupkan kamera, kabel USB langsung ke PC (hindari hub), dial ke **M**, kualitas **JPEG** (RAW saja akan ditolak dengan pesan jelas).
3. Cek: `gphoto2 --auto-detect` lalu `popsnap-doctor`. Kalau kamera tidak terbaca: cabut-colok USB.
4. Di Pengaturan > kamera pilih driver DSLR seperti biasa; di Linux semuanya lewat gPhoto2.
5. Beberapa variabel di `/etc/popsnap/popsnap.conf`: `GPHOTO_PORT`, `GPHOTO_CAMERA`, `GPHOTO_CAPTURE_TARGET`, `GPHOTO_KEEP`.
6. Profil kamera (ISO/rana/aperture/WB) tetap bisa diatur, tapi nilainya diambil dari daftar pilihan kamera lewat gPhoto2 dan tidak sama persis dengan di Windows. Cek hasilnya di satu booth dulu.

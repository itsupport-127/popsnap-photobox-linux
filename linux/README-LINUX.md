# POPSNAP di Linux (Chrome kiosk)

Mode ini menjalankan **backend sebagai layanan systemd** dan **tampilan booth di Chrome/Chromium layar penuh**.
Aplikasi desktop (.exe / Electron) tidak dipakai di Linux.

> Belum diuji di PC booth Linux sungguhan (kamera, printer, layar penuh). Uji dulu di satu booth.

## Yang didukung / tidak
- Didukung: webcam, template, QRIS, galeri, kasir, Remote, admin, cetak lewat CUPS.
- **Tidak didukung:** kamera DSLR Canon/Nikon lewat SDK, digiCamControl, dslrBooth, cetak ke `\\PC\printer` (semua khusus Windows).
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

# Status paket Linux

Terakhir diperbarui: 2026-11-24.

## Tujuan
Booth berjalan di Linux dengan perilaku sama seperti di Windows. Kamera DSLR di Linux kini lewat **gPhoto2** (`backend/gphotoBridge.js`). **Baru diuji dengan gphoto2 tiruan, belum dengan kamera asli**, jadi anggap belum terbukti sampai dicoba di satu booth. Webcam dan semua fitur lain sudah jalan.

## Sudah diuji (sandbox Ubuntu 24.04, bukan mesin booth)
| Hal | Hasil |
|---|---|
| Build `.deb` dan `.tar.gz` (Node 22 ikut dibundel, frontend dari `npm run build`) | lulus |
| Pasang dari .deb dan dari tar.gz | lulus |
| Update 1.0.0 -> 1.0.1: data utuh, cadangan database dibuat | lulus |
| Downgrade ditolak (deb dan tar), bisa dipaksa `POPSNAP_ALLOW_DOWNGRADE=1` | lulus |
| Hapus paket: aplikasi hilang, `/var/lib/popsnap` tetap | lulus |
| Layanan jalan sebagai user `popsnap`; `/`, `/admin`, rute React 200; aset hilang 404; API 200 | lulus |
| Unit systemd lolos `systemd-analyze verify` | lulus |
| Chrome + webcam palsu: layar Start, `getUserMedia`, halaman admin (setup akun), tanpa error konsol | lulus |
| `popsnap-doctor` | berjalan; peringatan wajar di sandbox (tanpa webcam/CUPS) |

## Belum diuji (butuh mesin Linux asli)
- Systemd sungguhan (enable/start saat boot, restart saat crash), autostart kiosk di desktop.
- Webcam fisik, izin kamera, `--kiosk-printing` ke printer CUPS, layar penuh dan penguncian.
- **Kamera DSLR asli lewat gPhoto2**: live view, jepret, RAW+JPEG, profil exposure/jadwal, izin udev, gvfs. Diuji hanya dengan `backend/test/fixtures/fake-gphoto2.js` (meniru aturan satu-proses-pegang-USB). Model kamera booth belum diketahui.
- Chromium **snap** (Ubuntu): sering bermasalah dengan kamera, profil, cetak. Pakai Google Chrome .deb. `popsnap-doctor` memperingatkan.

## Selisih dengan Windows
| Fitur | Windows | Linux |
|---|---|---|
| Webcam, template, QRIS, galeri, kasir, Remote, admin, GIF/Live/klip | ya | ya |
| Kamera DSLR (live view, exposure, profil, jadwal) | SDK (`popsnap_*_bridge.exe`) | gPhoto2 (kode ISO/rana/WB dibuat dari label kamera, tidak sama dengan kode SDK; belum teruji kamera asli) |
| Canon Auto Exposure live view boost | ya | tidak (tidak ada di gPhoto2) |
| digiCamControl, dslrBooth | ya | tidak |
| Cetak ke printer berbagi `\\PC\NAMA`, tombol tambah printer | ya | tidak (pakai CUPS lewat Chrome) |
| Kunci layar penuh rapat | ya (Electron) | tidak serapat (Esc ditahan ~2 dtk); pakai sesi kiosk khusus untuk kunci rapat |
| Dialog pilih folder/simpan file | ya (Electron) | versi browser (jatuh ke Downloads) |
| Tombol Tutup Aplikasi | ya | tidak ada |

## Kamera DSLR di Linux (gPhoto2)
- Kode: `backend/gphotoBridge.js` (memenuhi antarmuka kamera yang sama: `ensure/status/liveFrame/readFrameIfNew/capture/send/stop`), dipilih di `sdkBridge.get()` dan `cameraBridge.cfg()` kalau `process.platform === "linux"`. Windows tidak berubah.
- Hanya satu proses gphoto2 boleh memegang kamera, jadi semua panggilan diserialisasi (`exclusive()`): live view dihentikan, perintah jalan, live view menyala lagi 1,5 dtk setelah pekerjaan terakhir.
- Paket: aturan udev `70-popsnap-camera.rules` (grup `popsnap`), gvfs kamera di-mask, `gphoto2` direkomendasikan di .deb, `popsnap-doctor` mengecek gphoto2/kamera/udev/gvfs.
- Risiko yang belum terbukti: perilaku exposure di Canon asli, kualitas live view, capture target (RAM/kartu), model kamera yang tidak mendukung live view lewat gPhoto2. Lihat `docs/HISTORY.md` 2026-11-24.

## Keputusan desain yang berlaku
- Aplikasi dan data dipisah: `/opt/popsnap` (diganti saat update) vs `/var/lib/popsnap` (tidak pernah dihapus).
- Satu skrip jalan untuk semua cara pasang: `linux/bin/popsnap-start`.
- Port 4000 terbuka ke LAN (dibutuhkan QR/link unduh); keamanan endpoint kiosk lewat pembatasan loopback di `server.js`. Port tidak boleh diubah (frontend memanggil 4000).
- Rahasia hanya di `/var/lib/popsnap/.env` (600), tidak ikut paket, tidak ditimpa.

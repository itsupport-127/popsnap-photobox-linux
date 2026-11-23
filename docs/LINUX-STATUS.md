# Status paket Linux

Terakhir diperbarui: 2026-11-23.

## Tujuan
Booth berjalan di Linux dengan perilaku sama seperti di Windows. **Belum sepenuhnya tercapai**: kamera DSLR (Canon/Nikon via SDK) belum ada di Linux. Webcam dan semua fitur lain sudah jalan.

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
- Kamera DSLR: tidak ada di Linux (lihat bawah).
- Chromium **snap** (Ubuntu): sering bermasalah dengan kamera, profil, cetak. Pakai Google Chrome .deb. `popsnap-doctor` memperingatkan.

## Selisih dengan Windows
| Fitur | Windows | Linux |
|---|---|---|
| Webcam, template, QRIS, galeri, kasir, Remote, admin, GIF/Live/klip | ya | ya |
| Kamera Canon/Nikon via SDK (live view, exposure, profil, jadwal) | ya (`popsnap_*_bridge.exe`) | **tidak** (program perantara khusus Windows) |
| digiCamControl, dslrBooth | ya | tidak |
| Cetak ke printer berbagi `\\PC\NAMA`, tombol tambah printer | ya | tidak (pakai CUPS lewat Chrome) |
| Kunci layar penuh rapat | ya (Electron) | tidak serapat (Esc ditahan ~2 dtk); pakai sesi kiosk khusus untuk kunci rapat |
| Dialog pilih folder/simpan file | ya (Electron) | versi browser (jatuh ke Downloads) |
| Tombol Tutup Aplikasi | ya | tidak ada |

## Jalan keluar untuk DSLR di Linux (belum dikerjakan)
Backend punya antarmuka kamera yang sama untuk SDK Windows (`ensure/status/liveFrame/readFrameIfNew/capture/send/stop`). Bisa ditulis jembatan baru berbasis **gPhoto2** (`gphoto2 --capture-movie` untuk live view, `--capture-image-and-download` untuk jepret) yang memenuhi antarmuka itu. Catatan: exposure/profil/jadwal (ISO, Av, Tv, WB) di Canon lewat gPhoto2 berbeda dari EDSDK dan perlu diuji dengan kamera asli. Ada kode gPhoto2 awal di `electron/dslrBridge.js` (hanya untuk Electron, bukan backend).

## Keputusan desain yang berlaku
- Aplikasi dan data dipisah: `/opt/popsnap` (diganti saat update) vs `/var/lib/popsnap` (tidak pernah dihapus).
- Satu skrip jalan untuk semua cara pasang: `linux/bin/popsnap-start`.
- Port 4000 terbuka ke LAN (dibutuhkan QR/link unduh); keamanan endpoint kiosk lewat pembatasan loopback di `server.js`. Port tidak boleh diubah (frontend memanggil 4000).
- Rahasia hanya di `/var/lib/popsnap/.env` (600), tidak ikut paket, tidak ditimpa.

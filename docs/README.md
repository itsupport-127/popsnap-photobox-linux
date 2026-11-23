# Dokumentasi serah-terima (baca ini dulu)

Folder ini dibuat supaya pekerjaan bisa dilanjutkan oleh orang atau AI lain tanpa menebak.

| Berkas | Isi |
|---|---|
| [HISTORY.md](HISTORY.md) | Riwayat pengerjaan, terbaru di atas. **Tambah entri baru setiap selesai mengerjakan sesuatu.** |
| [APP-FLOW.md](APP-FLOW.md) | Alur dan isi aplikasi: layar booth, menu admin, backend, database, pengaturan, alur data. |
| [LINUX-STATUS.md](LINUX-STATUS.md) | Status paket Linux: apa yang sudah diuji, apa yang belum, selisih dengan Windows. |
| [../linux/README-LINUX.md](../linux/README-LINUX.md) | Panduan pasang dan pakai untuk operator. |

## Repo terkait
- `itsupport-127/popsnap-photobox` : aplikasi booth untuk Windows (Electron + backend + frontend). Sumber utama.
- `itsupport-127/popsnap-photobox-linux` : **repo ini**. Salinan photobox + folder `linux/` (paket .deb/.tar.gz, kiosk Chrome, systemd). Perbaikan umum di photobox sebaiknya dibawa ke sini juga.
- `itsupport-127/popsnap-remote` : web Remote (kontrol jarak jauh booth).
- `itsupport-127/popsnap-gallery` : galeri tamu (link unduh, admin galeri, R2).
- Kasir, paygate: repo terpisah, tidak dikerjakan di sini.

## Aturan kerja yang sudah disepakati dengan pemilik
1. Bahasa Indonesia, ringkas, tidak bertele-tele.
2. Jangan menyentuh aplikasi lain di VPS (mis. sertifikat popsnap-kasir) kecuali diminta.
3. Pengaturan yang tersinkron ke layanan lain (kasir, galeri, remote), rahasia, PIN, folder, nama perangkat, dan unggahan **tidak** dikontrol dari Remote.
4. Setiap perubahan diuji sungguhan (tes backend `backend/test/*.js`, build frontend, uji browser bila menyangkut tampilan) sebelum diserahkan.
5. Jangan mengaku sudah beres kalau belum diuji; tulis apa yang tidak bisa diuji (kamera, printer, layar penuh di mesin asli).
6. Sesi AI sebelumnya hanya punya akses baca ke repo GitHub, jadi hasilnya dikirim sebagai zip dan dipasang pemilik sendiri. Cek `git log` untuk tahu apa yang sudah masuk.
7. Setelah mengerjakan sesuatu: tambah entri di `HISTORY.md`; kalau alur/struktur berubah, perbarui `APP-FLOW.md`.

## Perintah cepat
```
# tes backend (Node 22.13+; di repo ini folder backend)
cd backend && npm ci && for t in test/*.js; do node --disable-warning=ExperimentalWarning $t || break; done
# build frontend
cd frontend && npm ci && npm run build
# paket Linux
linux/build-linux.sh --version 1.0.0
```

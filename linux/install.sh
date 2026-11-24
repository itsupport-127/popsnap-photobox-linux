#!/bin/sh
# Pemasang POPSNAP dari paket .tar.gz (setara paket .deb). Jalankan sebagai root:
#   sudo ./install.sh            pasang / update
#   sudo ./install.sh --uninstall   hapus aplikasi (DATA di /var/lib/popsnap tetap ada)
# Data & pengaturan (/var/lib/popsnap, /etc/popsnap/popsnap.conf) tidak pernah ditimpa.
set -eu
[ "$(id -u)" -eq 0 ] || { echo "Jalankan dengan sudo."; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
APP=/opt/popsnap; DATA="${POPSNAP_DATA:-/var/lib/popsnap}"

if [ "${1:-}" = "--uninstall" ]; then
  systemctl disable --now popsnap 2>/dev/null || true
  rm -f /etc/systemd/system/popsnap.service /etc/xdg/autostart/popsnap-kiosk.desktop /usr/local/bin/popsnap-doctor /usr/local/bin/popsnap-kiosk /etc/udev/rules.d/70-popsnap-camera.rules
  [ "$(readlink /etc/systemd/user/gvfs-gphoto2-volume-monitor.service 2>/dev/null)" = /dev/null ] && rm -f /etc/systemd/user/gvfs-gphoto2-volume-monitor.service
  rm -rf "$APP"; systemctl daemon-reload 2>/dev/null || true
  echo "POPSNAP dihapus. Data tetap ada di $DATA (hapus sendiri kalau memang tidak dipakai lagi)."; exit 0
fi

NEW="$(cat "$HERE/app/VERSION")"
OLD="$(cat "$APP/VERSION" 2>/dev/null || true)"
# Jangan turun versi diam-diam: database baru bisa tidak terbaca versi lama
if [ -n "$OLD" ] && [ "$(printf '%s\n%s\n' "$OLD" "$NEW" | sort -V | head -n1)" != "$OLD" ] && [ "$OLD" != "$NEW" ] && [ "${POPSNAP_ALLOW_DOWNGRADE:-0}" != "1" ]; then
  echo "Ditolak: terpasang $OLD, paket ini $NEW (lebih lama). Kalau memang sengaja: POPSNAP_ALLOW_DOWNGRADE=1 sudo -E ./install.sh"; exit 1
fi

getent group popsnap >/dev/null || groupadd --system popsnap
id popsnap >/dev/null 2>&1 || useradd --system --gid popsnap --home-dir "$DATA" --shell /usr/sbin/nologin popsnap
mkdir -p "$DATA"; chown -R popsnap:popsnap "$DATA"

systemctl stop popsnap 2>/dev/null || true
if [ -f "$DATA/db/popsnap.db" ]; then   # cadangan database sebelum menimpa aplikasi
  B="$DATA/backup/sebelum-update-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$B"
  cp -p "$DATA"/db/popsnap.db* "$B"/ 2>/dev/null || true; chown -R popsnap:popsnap "$DATA/backup"
  echo "Cadangan database: $B"
fi

rm -rf "$APP"; mkdir -p "$APP"; cp -a "$HERE/app/." "$APP/"
mkdir -p /etc/popsnap; [ -e /etc/popsnap/popsnap.conf ] || cp "$HERE/popsnap.conf" /etc/popsnap/popsnap.conf
cp "$HERE/popsnap.service" /etc/systemd/system/popsnap.service
mkdir -p /etc/xdg/autostart; cp "$HERE/popsnap-kiosk.desktop" /etc/xdg/autostart/popsnap-kiosk.desktop
ln -sf "$APP/bin/popsnap-doctor" /usr/local/bin/popsnap-doctor; ln -sf "$APP/bin/popsnap-kiosk" /usr/local/bin/popsnap-kiosk
# Kamera DSLR (gPhoto2): izin USB untuk layanan, lepas dari gvfs desktop
mkdir -p /etc/udev/rules.d /etc/systemd/user; cp "$HERE/70-popsnap-camera.rules" /etc/udev/rules.d/
[ -e /etc/systemd/user/gvfs-gphoto2-volume-monitor.service ] || ln -s /dev/null /etc/systemd/user/gvfs-gphoto2-volume-monitor.service
command -v udevadm >/dev/null 2>&1 && { udevadm control --reload 2>/dev/null || true; udevadm trigger --subsystem-match=usb 2>/dev/null || true; }
command -v gphoto2 >/dev/null 2>&1 || echo "Catatan: kamera DSLR butuh gphoto2 -> sudo apt install gphoto2"
systemctl daemon-reload 2>/dev/null || true
systemctl enable --now popsnap 2>/dev/null || echo "(systemd tidak aktif di sini: jalankan $APP/bin/popsnap-start sendiri)"
echo "POPSNAP $NEW terpasang. Cek: popsnap-doctor   |   Kiosk: popsnap-kiosk (otomatis di login desktop berikutnya)"

#!/bin/bash
# Membuat paket Linux POPSNAP: .deb + .tar.gz (pemasang install.sh). Jalankan di folder repo (mesin Linux):
#   linux/build-linux.sh [--version 1.0.0] [--node /path/ke/node] [--skip-frontend]
# Butuh: node 22.5+, npm, dpkg-deb, tar. Hasil: linux/dist/
# Node ikut dibundel (dari --node, atau node yang sedang dipakai) supaya mesin booth tidak perlu memasang Node sendiri.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; L="$ROOT/linux"
VERSION="$(node -p "require('$ROOT/electron/package.json').version")"; NODE_BIN="$(command -v node)"; SKIP_FE=0
while [ $# -gt 0 ]; do case "$1" in
  --version) VERSION="$2"; shift 2;; --node) NODE_BIN="$2"; shift 2;; --skip-frontend) SKIP_FE=1; shift;; *) echo "opsi tidak dikenal: $1"; exit 1;; esac; done
ARCH_DEB="$(dpkg --print-architecture 2>/dev/null || echo amd64)"
"$NODE_BIN" -e 'const [a,b]=process.versions.node.split(".").map(Number);if(!(a>22||(a===22&&b>=5))){console.error("Node 22.5+ dibutuhkan, ini "+process.version);process.exit(1)}'
echo "== POPSNAP $VERSION ($ARCH_DEB), node: $("$NODE_BIN" -v)"

OUT="$L/dist"; STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
APP="$STAGE/app"; mkdir -p "$APP/backend" "$APP/frontend" "$APP/bin" "$APP/node/bin" "$OUT"

if [ "$SKIP_FE" -eq 0 ]; then
  echo "== build frontend"; (cd "$ROOT/frontend" && { [ -d node_modules ] || npm ci; } && npm run build)
fi
[ -f "$ROOT/frontend/dist/index.html" ] || { echo "frontend/dist belum ada"; exit 1; }
cp -a "$ROOT/frontend/dist/." "$APP/frontend/"

echo "== backend (tanpa data, tanpa SDK Windows)"
tar -C "$ROOT/backend" --exclude=./node_modules --exclude=./db --exclude=./uploads --exclude=./output --exclude=./library \
  --exclude=./sdk --exclude=./test --exclude=./.env --exclude='./.env.*' -cf - . | tar -C "$APP/backend" -xf -
(cd "$APP/backend" && npm ci --omit=dev --no-audit --no-fund >/dev/null)
cp "$NODE_BIN" "$APP/node/bin/node"; chmod 755 "$APP/node/bin/node"
cp "$L"/bin/* "$APP/bin/"; chmod 755 "$APP"/bin/*
echo "$VERSION" > "$APP/VERSION"

BASE="popsnap-$VERSION-linux-$ARCH_DEB"
echo "== tar.gz"
T="$STAGE/$BASE"; mkdir -p "$T"; cp -a "$APP" "$T/app"
cp "$L/install.sh" "$L/popsnap.conf" "$L/systemd/popsnap.service" "$L/xdg/popsnap-kiosk.desktop" "$L/README-LINUX.md" "$T/"
tar -C "$STAGE" -czf "$OUT/$BASE.tar.gz" "$BASE"

echo "== .deb"
D="$STAGE/deb"; mkdir -p "$D/DEBIAN" "$D/opt" "$D/etc/popsnap" "$D/lib/systemd/system" "$D/etc/xdg/autostart"
cp -a "$APP" "$D/opt/popsnap"
cp "$L/popsnap.conf" "$D/etc/popsnap/popsnap.conf"; cp "$L/systemd/popsnap.service" "$D/lib/systemd/system/"; cp "$L/xdg/popsnap-kiosk.desktop" "$D/etc/xdg/autostart/"
for f in preinst postinst prerm postrm; do sed "s/@VERSION@/$VERSION/g" "$L/deb/$f" > "$D/DEBIAN/$f"; chmod 755 "$D/DEBIAN/$f"; done
echo /etc/popsnap/popsnap.conf > "$D/DEBIAN/conffiles"
SIZE="$(du -sk "$D/opt" | cut -f1)"
cat > "$D/DEBIAN/control" <<C
Package: popsnap
Version: $VERSION
Architecture: $ARCH_DEB
Maintainer: POPSNAP IT <it@popsnap.local>
Installed-Size: $SIZE
Depends: adduser, curl
Recommends: chromium | chromium-browser | google-chrome-stable, cups-client
Section: misc
Priority: optional
Description: POPSNAP photobooth (backend + tampilan booth, mode Chrome kiosk)
 Backend Node (dibundel), tampilan booth, layanan systemd, dan peluncur Chrome kiosk.
 Data disimpan terpisah di /var/lib/popsnap dan tidak pernah dihapus oleh paket.
 Kamera DSLR/Canon/Nikon via SDK Windows tidak didukung; webcam didukung.
C
dpkg-deb --root-owner-group -Zxz -z9 -b "$D" "$OUT/popsnap_${VERSION}_${ARCH_DEB}.deb" >/dev/null
( cd "$OUT" && sha256sum "$BASE.tar.gz" "popsnap_${VERSION}_${ARCH_DEB}.deb" > SHA256SUMS )
ls -la "$OUT"

#!/bin/sh
# Build paket Linux dari SALINAN BERSIH repo: node_modules Windows dan akhir baris CRLF tidak ikut.
# Dipakai oleh build-linux.bat (di dalam Docker/WSL). Bisa juga dijalankan langsung di Linux.
#   linux/build-clean.sh [versi]      hasil di <repo>/linux/dist/
set -eu
SRC="${SRC:-$(cd "$(dirname "$0")/.." && pwd)}"; VER="${1:-}"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
tar -C "$SRC" --exclude=./.git --exclude=node_modules --exclude=./linux/dist --exclude=./frontend/dist -cf - . | tar -C "$W" -xf -
# skrip dari Windows bisa ber-CRLF dan tanpa izin eksekusi
find "$W/linux" "$W/build-linux.sh" -type f \( -name '*.sh' -o -path '*/bin/*' -o -path '*/deb/*' -o -name '*.service' -o -name '*.desktop' -o -name '*.conf' -o -name '*.rules' \) -exec sed -i 's/\r$//' {} +
chmod +x "$W/build-linux.sh" "$W/linux/build-linux.sh" "$W/linux/install.sh" "$W/linux/bin/"*
cd "$W"
if [ -n "$VER" ]; then linux/build-linux.sh --version "$VER"; else linux/build-linux.sh; fi
mkdir -p "$SRC/linux/dist"; cp -f "$W"/linux/dist/* "$SRC/linux/dist/"
echo; echo "Selesai. Hasil di: $SRC/linux/dist"; ls -la "$SRC/linux/dist"

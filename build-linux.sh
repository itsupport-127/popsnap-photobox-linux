#!/bin/sh
# Satu perintah: build tampilan + backend lalu buat .deb dan .tar.gz di linux/dist/ (setara build-exe.bat di Windows).
#   ./build-linux.sh            versi dari electron/package.json
#   ./build-linux.sh 1.1.0      versi tertentu
cd "$(dirname "$0")" || exit 1
if [ -n "${1:-}" ]; then exec linux/build-linux.sh --version "$1"; else exec linux/build-linux.sh; fi

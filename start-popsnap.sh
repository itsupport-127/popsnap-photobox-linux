#!/bin/bash
# Setara start-popsnap.bat untuk Linux/macOS (mode pengembangan): backend (port 4000) + tampilan Vite (port 5173).
# Butuh Node.js 22.5+ dan npm. Log di folder .run/. Hentikan dengan ./stop-popsnap.sh
set -u
cd "$(dirname "$0")"
RUN=.run; mkdir -p "$RUN"

echo "==================================="
echo "  POPSNAP - Menjalankan Aplikasi"
echo "==================================="

command -v node >/dev/null 2>&1 || { echo "Node.js tidak ditemukan. Pasang Node 22.5 atau lebih baru."; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)' || { echo "Node $(node -v) terlalu lama (butuh 22.5+)."; exit 1; }

if [ -f "$RUN/backend.pid" ] && kill -0 "$(cat "$RUN/backend.pid")" 2>/dev/null; then
  echo "POPSNAP sudah jalan. Hentikan dulu: ./stop-popsnap.sh"; exit 1
fi

for d in backend frontend; do
  if [ ! -d "$d/node_modules" ]; then echo "[install] $d (cuma sekali di awal)..."; (cd "$d" && npm install) || { echo "npm install $d gagal"; exit 1; }
  else echo "[ok] dependencies $d sudah ada"; fi
done

echo "[1/2] Menjalankan backend..."
(cd backend && exec npm start) > "$RUN/backend.log" 2>&1 &
echo $! > "$RUN/backend.pid"

# Tunggu backend siap (maks ±30 dtk)
for i in $(seq 1 30); do
  curl -fsS -o /dev/null "http://localhost:4000/api/settings/public" 2>/dev/null && break
  sleep 1
done

echo "[2/2] Menjalankan frontend..."
(cd frontend && exec npm run dev -- --host) > "$RUN/frontend.log" 2>&1 &
echo $! > "$RUN/frontend.pid"
for i in $(seq 1 30); do curl -fsS -o /dev/null "http://localhost:5173/" 2>/dev/null && break; sleep 1; done

URL="http://localhost:5173"
echo "Membuka browser..."
if [ "$(uname)" = "Darwin" ]; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || echo "Buka manual: $URL"; else echo "Buka manual: $URL"; fi

echo
echo "==================================="
echo "  POPSNAP sudah jalan!"
echo "  - Booth : $URL"
echo "  - Admin : $URL/admin"
echo "  - Log   : $RUN/backend.log, $RUN/frontend.log"
echo "  - Tutup : ./stop-popsnap.sh"
echo "==================================="
echo "Catatan Linux: kamera Nikon/Canon lewat SDK (jembatan .exe) belum jalan di Linux; pakai webcam."

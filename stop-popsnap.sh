#!/bin/bash
# Setara stop-popsnap.bat untuk Linux/macOS: hentikan backend & frontend yang dijalankan start-popsnap.sh
cd "$(dirname "$0")"
RUN=.run
for n in frontend backend; do
  f="$RUN/$n.pid"
  if [ -f "$f" ]; then
    pid="$(cat "$f")"
    if kill -0 "$pid" 2>/dev/null; then
      pkill -TERM -P "$pid" 2>/dev/null   # anak proses (npm -> node/vite)
      kill -TERM "$pid" 2>/dev/null
      echo "$n dihentikan"
    fi
    rm -f "$f"
  fi
done
# sisa proses node di port 4000 / 5173 (kalau npm sudah mati tapi node masih hidup)
for p in 4000 5173; do
  pid="$(command -v lsof >/dev/null 2>&1 && lsof -ti tcp:$p 2>/dev/null)"
  [ -n "$pid" ] && kill $pid 2>/dev/null && echo "proses di port $p dihentikan"
done
echo "POPSNAP berhenti."

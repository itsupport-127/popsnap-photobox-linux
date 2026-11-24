#!/usr/bin/env node
// gphoto2 PALSU untuk uji (tanpa kamera). Meniru: --auto-detect, --get-config, --set-config, --capture-movie --stdout,
// --capture-image-and-download. Meniru juga aturan USB asli: hanya satu proses yang boleh memegang kamera
// (kalau ada yang lain: "Could not claim the USB device"). Semua perintah dicatat di $FAKE_GP_DIR/calls.log.
const fs = require("fs"), path = require("path");
const D = process.env.FAKE_GP_DIR, args = process.argv.slice(2);
const { variants } = require("./jpegs");
const log = (s) => fs.appendFileSync(path.join(D, "calls.log"), s + "\n");
const stateFile = path.join(D, "state.json");
const state = () => JSON.parse(fs.readFileSync(stateFile, "utf8"));
const save = (s) => fs.writeFileSync(stateFile, JSON.stringify(s));
log(args.join(" "));

if (args.includes("--auto-detect")) {
  if (state().noCamera) { console.log("Model                          Port\n----------------------------------------------------------"); process.exit(0); }
  console.log("Model                          Port\n----------------------------------------------------------\nFake Canon EOS 600D            usb:001,004"); process.exit(0);
}
const lock = path.join(D, "claim.lock");
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
try { fs.writeFileSync(lock, String(process.pid), { flag: "wx" }); }
catch {
  let stale = false; try { stale = !alive(Number(fs.readFileSync(lock, "utf8"))); } catch { /* hilang */ }
  if (!stale) { log("CLAIM-FAIL " + args.join(" ")); console.error("*** Error (-53: 'Could not claim the USB device')"); process.exit(1); }
  fs.writeFileSync(lock, String(process.pid));
}
const release = () => { try { if (fs.readFileSync(lock, "utf8") === String(process.pid)) fs.unlinkSync(lock); } catch { /* sudah dilepas */ } };
process.on("exit", release); process.on("SIGTERM", () => process.exit(0));

const s = state();
const blockOf = (n) => { const c = s.config[n]; if (!c) return null; return `Label: ${c.label || n}\nReadonly: ${c.readonly ? 1 : 0}\nType: RADIO\nCurrent: ${c.current}\n` + c.choices.map((x, i) => `Choice: ${i} ${x}`).join("\n") + "\nEND\n"; };
const gi = args.indexOf("--get-config");
if (gi >= 0) { const b = blockOf(args[gi + 1]); if (!b) { console.error(`*** Error: Unknown config ${args[gi + 1]}`); process.exit(1); } process.stdout.write(b); process.exit(0); }
const si = args.indexOf("--set-config");
if (si >= 0) {
  const [n, ...v] = args[si + 1].split("="), val = v.join("="), c = s.config[n];
  if (!c) { console.error("*** Error: Unknown config " + n); process.exit(1); }
  if (c.readonly) { console.error("*** Error: Camera config is read-only"); process.exit(1); }
  if (!c.choices.includes(val)) { console.error(`*** Error: Choice ${val} not valid for ${n}`); process.exit(1); }
  c.current = val; save(s); log(`SET ${n}=${val}`); process.exit(0);
}
if (args.includes("--capture-movie")) {
  const v = variants(); let i = 0;
  process.stdout.on("error", () => process.exit(0));
  setInterval(() => process.stdout.write(v[i++ % v.length]), 60);
} else if (args.includes("--capture-image-and-download")) {
  const pat = args[args.indexOf("--filename") + 1];
  setTimeout(() => {
    if (s.failBusy > 0) { s.failBusy--; save(s); console.error("*** Error: PTP Device Busy"); process.exit(1); }
    const out = (ext, buf) => { const f = pat.replace("%C", ext); fs.writeFileSync(f, buf); console.log("Saving file as " + f); };
    if (s.rawOnly) out("cr2", Buffer.alloc(5000, 7)); else { out("jpg", variants()[0]); if (s.rawPlusJpeg) out("cr2", Buffer.alloc(9000, 7)); }
    process.exit(0);
  }, 400);
} else { console.error("*** Error: perintah tidak dikenal"); process.exit(1); }

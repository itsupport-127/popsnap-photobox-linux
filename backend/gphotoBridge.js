// ==========================================================
// gphotoBridge — kamera DSLR / mirrorless (Canon, Nikon, Sony, dll) di LINUX lewat gPhoto2 (program `gphoto2`, gratis).
//
// Pengganti program perantara Windows (popsnap_canon_bridge.exe dst.): antarmukanya SAMA dengan NativeBridge/SdkBridge
//   ensure / status / liveFrame / readFrameIfNew / waitFrame / capture / send / stop / camInfo / camSet
// sehingga cameraBridge.js (live view MJPEG, jepret, profil Live/Foto, jadwal, alat Remote) jalan tanpa diubah.
//
// Cara kerja (satu proses gphoto2 memegang kamera lewat USB pada satu waktu, jadi semua dijalankan bergiliran):
//   live view : `gphoto2 --stdout --capture-movie`  -> aliran JPEG berurutan di stdout, dipecah jadi frame
//   jepret    : live view dihentikan -> `gphoto2 --capture-image-and-download` -> baca JPEG -> live view dinyalakan lagi
//   setelan   : `gphoto2 --get-config / --set-config` (iso, shutterspeed, aperture, whitebalance)
//
// Kode setelan yang dikirim ke UI/Remote berbentuk angka yang dibuat dari labelnya (bukan kode EDSDK Windows):
//   iso = angka ISO (Auto = 0) | av = f x 10 (f/5.6 -> 56) | tv = mikrodetik (1/125 -> 8000, bulb = 0) | wb = hash label
// Dengan begitu profil yang tersimpan tetap cocok walau kamera diganti (dicocokkan ke pilihan terdekat yang ada).
//
// Variabel lingkungan (opsional, lihat /etc/popsnap/popsnap.conf):
//   GPHOTO2_BIN=gphoto2   GPHOTO_PORT=usb:001,004   GPHOTO_CAMERA="Canon EOS 600D"
//   GPHOTO_KEEP=1 (simpan foto di kartu kamera; bawaan dihapus setelah diunduh)   GPHOTO_CAPTURE_TARGET=0 (Internal RAM)
// ==========================================================
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BIN = () => process.env.GPHOTO2_BIN || "gphoto2";

/** Lokasi program gphoto2 (atau null kalau belum terpasang). */
function binary() {
  const b = BIN();
  const ok = (f) => { try { fs.accessSync(f, fs.constants.X_OK); return fs.statSync(f).isFile(); } catch { return false; } };
  if (b.includes("/")) return ok(b) ? b : null;
  for (const d of String(process.env.PATH || "").split(":")) if (d && ok(path.join(d, b))) return path.join(d, b);
  return null;
}
const baseArgs = () => { const a = []; if (process.env.GPHOTO_PORT) a.push("--port", process.env.GPHOTO_PORT); if (process.env.GPHOTO_CAMERA) a.push("--camera", process.env.GPHOTO_CAMERA); return a; };

// ---------- pemecah aliran JPEG ----------
// Aliran `--capture-movie` = JPEG-JPEG berurutan. Mencari FFD9 saja tidak cukup (JPEG bisa memuat thumbnail JPEG di EXIF),
// jadi segmen dibaca satu per satu sampai data gambar (SOS) lalu dicari penutup (EOI) yang asli.
/** @returns {{frame:Buffer,rest:Buffer}|{skip:number}|null}  null = data belum cukup. */
function takeJpeg(buf) {
  const s = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  if (s < 0) return { skip: Math.max(0, buf.length - 2) }; // belum ada awal JPEG: buang sampah, sisakan 2 byte
  if (s > 0) return { skip: s };
  let i = 2;
  for (;;) {
    if (i + 4 > buf.length) return null;
    if (buf[i] !== 0xff) return { skip: 2 };               // struktur rusak: lewati awal ini
    const m = buf[i + 1];
    if (m === 0xff) { i++; continue; }                      // byte pengisi
    if (m === 0xd9) return { frame: buf.subarray(0, i + 2), rest: buf.subarray(i + 2) };
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; } // penanda tanpa panjang
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return { skip: 2 };
    if (m !== 0xda) { i += 2 + len; continue; }             // segmen biasa (APP/DQT/DHT/SOF/...)
    // SOS: lewati header lalu baca data terkompresi sampai penanda berikutnya
    let j = i + 2 + len;
    for (;;) {
      if (j + 1 >= buf.length) return null;
      if (buf[j] !== 0xff) { j++; continue; }
      const n = buf[j + 1];
      if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) { j += 2; continue; } // byte yang disisipi / penanda restart
      if (n === 0xff) { j++; continue; }
      if (n === 0xd9) return { frame: buf.subarray(0, j + 2), rest: buf.subarray(j + 2) };
      i = j; break;                                          // penanda lain (JPEG progresif: SOS/DHT berikutnya)
    }
  }
}

// ---------- membaca setelan kamera ----------
const PROP_NAMES = { iso: ["iso"], tv: ["shutterspeed", "shutterspeed2"], av: ["aperture", "f-number"], wb: ["whitebalance"] };
const MODE_NAMES = ["autoexposuremodedial", "autoexposuremode", "expprogram"];
const fnv = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
const seconds = (l) => {
  const t = String(l).trim().replace(/["”″s]+$/i, "");
  const f = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(t);
  if (f) return Number(f[2]) ? Number(f[1]) / Number(f[2]) : null;
  return /^\d+(?:\.\d+)?$/.test(t) ? Number(t) : null;
};
/** Label pilihan gPhoto2 -> kode angka (string) atau null kalau pilihan tak bisa dipakai (mis. "Lo 1"). */
const ENCODE = {
  iso: (l) => (/^auto$/i.test(l) ? "0" : /^\d{1,6}$/.test(l.trim()) ? String(Number(l)) : null),
  av: (l) => { const n = parseFloat(String(l).replace(/^f\s*\/?\s*/i, "")); return Number.isFinite(n) && n > 0 ? String(Math.round(n * 10)) : null; },
  tv: (l) => { if (/^bulb$/i.test(l.trim())) return "0"; const s = seconds(l); return s && s > 0 ? String(Math.min(9999999999, Math.round(s * 1e6))) : null; },
  wb: (l) => String(1 + (fnv(String(l).trim().toLowerCase()) % 899999999)),
};

/** Teks `gphoto2 --get-config X` -> { label, type, readonly, current, choices:[{idx,label}] } */
function parseConfig(text) {
  const o = { label: "", type: "", readonly: false, current: "", choices: [] };
  for (const ln of String(text).split(/\r?\n/)) {
    let m;
    if ((m = /^Label:\s*(.*)$/.exec(ln))) o.label = m[1];
    else if ((m = /^Type:\s*(.*)$/.exec(ln))) o.type = m[1].trim();
    else if ((m = /^Readonly:\s*(\d)/.exec(ln))) o.readonly = m[1] === "1";
    else if ((m = /^Current:\s*(.*)$/.exec(ln))) o.current = m[1].trim();
    else if ((m = /^Choice:\s*(\d+)\s+(.*)$/.exec(ln))) o.choices.push({ idx: Number(m[1]), label: m[2].trim() });
  }
  return o;
}

/** Terjemahkan pesan galat gPhoto2 jadi petunjuk yang bisa ditindaklanjuti operator. */
function friendly(stderr, fallback) {
  const t = String(stderr || "");
  if (/claim/i.test(t)) return "Kamera sedang dipakai program lain (biasanya pengelola file desktop / gvfs). Jalankan popsnap-doctor, atau cabut-colok kabel USB kamera.";
  if (/No camera found|Unknown model|could not find/i.test(t)) return "Kamera tidak terdeteksi. Nyalakan kamera, colok USB, atur ke mode foto/M. Cek: gphoto2 --auto-detect";
  if (/permission denied|not permitted|LIBUSB_ERROR_ACCESS/i.test(t)) return "Tidak punya izin membuka kamera di USB. Cabut-colok kabel setelah memasang paket (aturan udev), atau jalankan popsnap-doctor.";
  if (/busy/i.test(t)) return "Kamera sedang sibuk. Coba lagi sebentar.";
  if (/read-?only/i.test(t)) return "Setelan ini terkunci di kamera (putar dial mode ke M untuk mengatur ISO / shutter / aperture).";
  const e = /\*\*\* Error[^\n]*/.exec(t) || /Error[^\n]*/.exec(t);
  return (e && e[0].replace(/^\*+\s*/, "").slice(0, 160)) || fallback;
}

class GphotoBridge {
  constructor() {
    this.brand = "gphoto2"; this.native = true; this.proc = null; this.lines = [];
    this.q = Promise.resolve(); this.busy = 0; this.lvWanted = false; this.restartTimer = null;
    this.connected = false; this.camera = ""; this.detectAt = 0; this.error = "";
    this.lvOn = false; this.frame = null; this.frameSeq = 0; this.lastSeq = 0; this.lastFrameAt = 0; this.frameWaiters = [];
    this.frameOk = 0; this.resyncBytes = 0; this.bridgeFps = 0; this._fpsN = 0; this._fpsT = Date.now();
    this.expApplied = {}; this.expErrors = {}; this.profile = ""; this.cfgNames = {}; this.codeMaps = {}; this.waiters = [];
    this.rx = Buffer.alloc(0);
  }
  log(l) { this.lines.push(l); if (this.lines.length > 60) this.lines.shift(); console.log("[gphoto2]", l); }

  /** Jalankan gphoto2 sekali sampai selesai. @returns {{code,stdout:Buffer,stderr:string}} */
  run(args, { timeout = 20000 } = {}) {
    return new Promise((resolve) => {
      const bin = binary();
      if (!bin) return resolve({ code: 127, stdout: Buffer.alloc(0), stderr: "gphoto2 tidak ditemukan" });
      const out = [], err = [];
      let done = false, p;
      const fin = (code) => { if (done) return; done = true; clearTimeout(t); resolve({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString("utf8") }); };
      const t = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* sudah mati */ } err.push(Buffer.from("*** Error: timeout")); fin(124); }, timeout);
      try { p = spawn(bin, [...baseArgs(), ...args], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, LANG: "C", LC_ALL: "C" } }); } catch (e) { return fin(126); }
      p.stdout.on("data", (d) => out.push(d)); p.stderr.on("data", (d) => err.push(d));
      p.on("error", (e) => { err.push(Buffer.from(String(e.message))); fin(126); });
      p.on("close", (c) => fin(c == null ? 1 : c));
    });
  }

  async detect() {
    const r = await this.run(["--auto-detect"], { timeout: 10000 });
    const rows = r.stdout.toString("utf8").split(/\r?\n/).slice(2).map((l) => l.trim()).filter(Boolean)
      .map((l) => { const m = /^(.*?)\s{2,}(\S+)$/.exec(l); return m ? { model: m[1].trim(), port: m[2] } : null; }).filter(Boolean);
    return { rows, stderr: r.stderr };
  }

  async ensure() {
    if (!binary()) { this.error = "gphoto2 belum terpasang"; throw new Error("gphoto2 belum terpasang. Pasang: sudo apt install gphoto2, lalu jalankan popsnap-doctor."); }
    if ((this.proc || this.busy) && this.connected) return;  // live view / perintah lain sedang memegang kamera
    if (this.connected && Date.now() - this.detectAt < 3000) return;
    const d = await this.detect();
    if (!d.rows.length) { this.connected = false; this.camera = ""; this.error = friendly(d.stderr, "Kamera belum tersambung. Nyalakan kamera & colok USB."); throw new Error(this.error); }
    if (!this.connected) this.log(`kamera terdeteksi: ${d.rows[0].model} (${d.rows[0].port})`);
    this.connected = true; this.camera = d.rows[0].model; this.detectAt = Date.now(); this.error = "";
  }

  // ---- live view ----
  startStream() {
    if (this.proc) return; const bin = binary(); if (!bin) return;
    this.rx = Buffer.alloc(0);
    let p;
    try { p = spawn(bin, [...baseArgs(), "--stdout", "--capture-movie"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, LANG: "C", LC_ALL: "C" } }); }
    catch (e) { this.error = e.message; return; }
    this.proc = p; this.lvOn = true; this.stopping = false; this._startedAt = Date.now(); this.log("live view dimulai");
    p.stdout.on("data", (d) => this.feed(d));
    let errBuf = "";
    p.stderr.on("data", (d) => { errBuf = (errBuf + d.toString()).slice(-2000); if (/\*\*\*|Error|claim/i.test(errBuf)) this.error = friendly(errBuf, this.error); });
    p.on("error", (e) => { this.error = e.message; });
    p.on("close", (code) => {
      if (this.proc === p) { this.proc = null; this.lvOn = false; this.frame = null; }
      if (!this.stopping) { this.log(`live view berhenti (kode ${code}) ${errBuf.trim().split("\n").pop() || ""}`); if (/claim|No camera|Unknown model/i.test(errBuf)) this.connected = false; }
      for (const f of this.frameWaiters.splice(0)) f();
    });
  }
  async stopStream() {
    const p = this.proc; if (!p) { this.lvOn = false; return; }
    this.stopping = true;
    await new Promise((resolve) => {
      let done = false; const fin = () => { if (!done) { done = true; clearTimeout(k); resolve(); } };
      const k = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* mati */ } setTimeout(fin, 300); }, 2500);
      p.once("close", fin); try { p.kill("SIGTERM"); } catch { fin(); }
    });
    if (this.proc === p) this.proc = null;
    this.lvOn = false; this.frame = null;
    await wait(250); // beri waktu USB dilepas sebelum perintah gphoto2 berikutnya
  }
  feed(d) {
    this.rx = this.rx.length ? Buffer.concat([this.rx, d]) : d;
    for (let guard = 0; guard < 200; guard++) {
      const r = takeJpeg(this.rx);
      if (!r) break;
      if (r.skip !== undefined) { this.resyncBytes += r.skip; this.rx = this.rx.subarray(r.skip); if (!r.skip) break; continue; }
      this.rx = r.rest; this.onFrame(Buffer.from(r.frame));
    }
    if (this.rx.length > 16 * 1024 * 1024) { this.resyncBytes += this.rx.length; this.rx = Buffer.alloc(0); } // aliran rusak: mulai ulang
  }
  onFrame(buf) {
    if (buf.length < 500) return;
    this.frame = buf; this.frameSeq++; this.frameOk++; this.lvOn = true; this.lastFrameAt = Date.now(); this.error = "";
    this._fpsN++; const n = Date.now(); if (n - this._fpsT >= 1000) { this.bridgeFps = Math.round(this._fpsN * 1000 / (n - this._fpsT) * 10) / 10; this._fpsN = 0; this._fpsT = n; }
    for (const f of this.frameWaiters.splice(0)) f();
  }
  waitFrame(ms) {
    if (this.frameSeq !== this.lastSeq) return Promise.resolve();
    return new Promise((resolve) => {
      let t; const done = () => { clearTimeout(t); const i = this.frameWaiters.indexOf(done); if (i >= 0) this.frameWaiters.splice(i, 1); resolve(); };
      t = setTimeout(done, ms); this.frameWaiters.push(done);
    });
  }
  readFrameIfNew() { if (this.frameSeq === this.lastSeq || !this.frame) return null; this.lastSeq = this.frameSeq; return this.frame; }
  async liveFrame() {
    await this.ensure();
    this.lvWanted = true; if (!this.busy) this.startStream();
    for (let i = 0; i < 60; i++) { if (this.frame) return this.frame; await wait(100); }
    throw new Error(this.error || "live view belum siap");
  }

  cancelRestart() { if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; } }
  scheduleRestart(ms) { this.cancelRestart(); this.restartTimer = setTimeout(() => { this.restartTimer = null; if (this.lvWanted && !this.proc && !this.busy) this.startStream(); }, ms); }

  /** Jalankan fn sendirian: live view dihentikan dulu (kamera hanya bisa dipegang satu proses), lalu dinyalakan lagi sesudahnya. */
  exclusive(fn) {
    this.busy++; this.cancelRestart();
    const job = this.q.then(async () => {
      await this.stopStream();
      try { return await fn(); }
      finally { this.busy = Math.max(0, this.busy - 1); if (!this.busy && this.lvWanted) this.scheduleRestart(1500); } // jeda: beberapa setelan beruntun tidak memulai ulang live view tiap kali
    });
    this.q = job.catch(() => {});
    return job;
  }

  send(cmd) {
    const c = String(cmd).trim().split(/\s+/)[0];
    if (c === "LIVEVIEW_START") { this.lvWanted = true; if (!this.busy && !this.proc) this.startStream(); }
    else if (c === "LIVEVIEW_STOP") { this.lvWanted = false; this.cancelRestart(); if (!this.busy) this.stopStream().catch(() => {}); }
    else if (c === "QUIT") this.stop();
  }
  stop() { this.lvWanted = false; this.cancelRestart(); this.stopStream().catch(() => {}); }

  // ---- jepret ----
  async capture() {
    await this.ensure();
    return this.exclusive(async () => {
      let lastErr = "";
      for (let attempt = 1; attempt <= 3; attempt++) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "popsnap-cap-"));
        try {
          const args = [];
          if (process.env.GPHOTO_CAPTURE_TARGET) args.push("--set-config-index", `capturetarget=${process.env.GPHOTO_CAPTURE_TARGET}`);
          args.push("--capture-image-and-download", process.env.GPHOTO_KEEP === "1" ? "--keep" : "--no-keep", "--force-overwrite", "--filename", path.join(dir, "cap.%C"));
          const r = await this.run(args, { timeout: 35000 });
          const files = fs.readdirSync(dir).map((f) => path.join(dir, f));
          const jpgs = files.filter((f) => /\.jpe?g$/i.test(f)).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
          if (jpgs.length) { const b = fs.readFileSync(jpgs[0]); if (b.length > 1000 && b[0] === 0xff && b[1] === 0xd8) { this.connected = true; this.error = ""; return b; } }
          if (files.length) throw new Error(`Kamera menyimpan ${path.extname(files[0]).toUpperCase().slice(1)} saja. Atur kualitas foto kamera ke JPEG (atau RAW+JPEG).`);
          lastErr = friendly(r.stderr, "Foto tidak datang dari kamera. Cek JPEG, fokus, dan mode kamera.");
          this.log(`jepret percobaan ${attempt} gagal: ${lastErr}`);
          if (/tidak terdeteksi|izin/i.test(lastErr)) break;      // percobaan ulang tidak akan membantu
        } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* abaikan */ } }
        await wait(900 * attempt);
      }
      this.error = lastErr; throw new Error(lastErr);
    });
  }

  // ---- setelan kamera ----
  async readProp(prop) {
    for (const name of this.cfgNames[prop] ? [this.cfgNames[prop]] : PROP_NAMES[prop]) {
      const r = await this.run(["--get-config", name], { timeout: 10000 });
      if (r.code !== 0 || !/^Type:/m.test(r.stdout.toString())) continue;
      this.cfgNames[prop] = name;
      const c = parseConfig(r.stdout.toString());
      const map = new Map(), opts = [];
      for (const ch of c.choices) { const code = ENCODE[prop](ch.label); if (code != null && !map.has(code)) { map.set(code, ch.label); opts.push([code, ch.label]); } }
      this.codeMaps[prop] = map;
      return { cur: ENCODE[prop](c.current) ?? "", opts, readonly: c.readonly, label: c.current };
    }
    return { cur: "", opts: [], missing: true };
  }
  async readAll() {
    const info = {};
    for (const p of ["iso", "tv", "av", "wb"]) info[p] = await this.readProp(p);
    for (const n of MODE_NAMES) {
      const r = await this.run(["--get-config", n], { timeout: 10000 });
      const m = /^Current:\s*(.*)$/m.exec(r.stdout.toString());
      if (r.code === 0 && m) { info.manual = /^(m|manual)$/i.test(m[1].trim()); info.mode = m[1].trim(); break; }
    }
    if (info.iso.missing && info.tv.missing && info.av.missing) return { error: "Kamera ini tidak menyediakan setelan eksposur lewat gPhoto2." };
    info.camera = this.camera; info.engine = "gphoto2";
    return info;
  }
  async camInfo() { await this.ensure(); return this.exclusive(() => this.readAll()); }

  async camSet(model, prop, value, { quiet = false } = {}) {
    await this.ensure();
    if (!/^(iso|av|tv|wb)$/.test(prop) || !/^\d{1,10}$/.test(String(value))) return { ok: false, error: "Setelan tidak valid" };
    return this.exclusive(async () => {
      if (!this.codeMaps[prop] || !this.cfgNames[prop]) await this.readProp(prop);
      let label = this.codeMaps[prop]?.get(String(value));
      if (label == null) { // kode tersimpan dari kamera lain: pakai pilihan terdekat yang ada
        const want = Number(value), cands = [...(this.codeMaps[prop]?.keys() || [])].map(Number).filter(Number.isFinite);
        if (cands.length && prop !== "wb") { const best = cands.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a)); label = this.codeMaps[prop].get(String(best)); }
      }
      if (label == null || !this.cfgNames[prop]) return { ok: false, prop, error: "Pilihan ini tidak ada di kamera" };
      const r = await this.run(["--set-config", `${this.cfgNames[prop]}=${label}`], { timeout: 15000 });
      if (r.code !== 0 || /\*\*\* Error/.test(r.stderr)) return { ok: false, prop, error: friendly(r.stderr, "Ditolak kamera") };
      return { ok: true, prop, info: quiet ? null : await this.readAll() };
    });
  }

  status() {
    return { running: !!this.proc, connected: this.connected, camera: this.camera, error: this.error, native: true, engine: "gphoto2", bridgeFps: this.bridgeFps, framesOk: this.frameOk, resyncBytes: this.resyncBytes, log: this.lines.slice(-12) };
  }
}

let single = null;
const instance = () => single || (single = new GphotoBridge());
process.on("exit", () => { try { single?.proc?.kill("SIGKILL"); } catch { /* abaikan */ } });

module.exports = { GphotoBridge, instance, binary, takeJpeg, parseConfig, ENCODE, friendly };

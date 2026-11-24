// Uji lewat backend sungguhan (Linux): status kamera, aliran live view MJPEG, jepret, profil Live/Foto dikirim ke kamera sebelum jepret,
// jadwal, dan lewat alat Remote. Kamera = gphoto2 palsu (test/fixtures/fake-gphoto2.js).
if (process.platform !== "linux") { console.log("lewati: hanya Linux"); process.exit(0); }
const os = require("os"), fs = require("fs"), path = require("path"), assert = require("assert"), { spawn } = require("child_process");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "gph-")), FD = fs.mkdtempSync(path.join(os.tmpdir(), "fakegp-"));
const PORT = 4900 + Math.floor(Math.random() * 90), B = `http://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (m) => console.log("ok  " + m);
fs.writeFileSync(path.join(FD, "state.json"), JSON.stringify({ config: {
  iso: { current: "400", choices: ["Auto", "100", "200", "400", "800", "1600"] },
  shutterspeed: { current: "1/125", choices: ["1/60", "1/125", "1/250"] },
  aperture: { current: "5.6", choices: ["4", "5.6", "8"] },
  whitebalance: { current: "Auto", choices: ["Auto", "Daylight", "Flash"] },
  autoexposuremodedial: { current: "Manual", choices: ["Manual"] },
} }));
const ENV = { ...process.env, PORT: String(PORT), POPSNAP_DATA: DATA, OUTPUT_DIR: path.join(DATA, "output"), GPHOTO2_BIN: path.join(__dirname, "fixtures", "fake-gphoto2.js"), FAKE_GP_DIR: FD };
// profil: Foto ISO 100 + f/8, Live ISO 800 (kode angka dari label)
Object.assign(process.env, ENV);
const settings = require("../settings");
settings.update({ camera: { mode: "dslr", exposure: { split: true, photo: { iso: "100", av: "80" }, live: { iso: "800" } } } });
const calls = () => (fs.existsSync(path.join(FD, "calls.log")) ? fs.readFileSync(path.join(FD, "calls.log"), "utf8") : "");
let srv, log = "";
(async () => {
  try {
    srv = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: ENV, stdio: ["ignore", "pipe", "pipe"] });
    srv.stdout.on("data", (x) => (log += x)); srv.stderr.on("data", (x) => (log += x));
    for (let i = 0; i < 80; i++) { try { await fetch(B + "/api/health"); break; } catch { await wait(250); } }

    const st = await (await fetch(B + "/api/camera/dslr/status")).json();
    assert.ok(st.online && /Canon EOS 600D/.test((st.cameras || []).join()), JSON.stringify(st));
    assert.strictEqual(st.driver, "gphoto2");
    ok("status: kamera Canon EOS 600D online lewat gPhoto2 (tanpa mengubah pengaturan driver)");

    // aliran MJPEG: baca ~2 dtk, hitung bagian "--popsnapframe"
    const ac = new AbortController(); const res = await fetch(B + "/api/camera/dslr/stream", { signal: ac.signal });
    assert.ok(/multipart\/x-mixed-replace/.test(res.headers.get("content-type")));
    let got = Buffer.alloc(0); const rd = res.body.getReader(); const t0 = Date.now();
    while (Date.now() - t0 < 3500) { const { value, done } = await Promise.race([rd.read(), wait(1500).then(() => ({ done: true }))]); if (done) break; got = Buffer.concat([got, value]); }
    const frames = (got.toString("latin1").match(/--popsnapframe/g) || []).length;
    assert.ok(frames >= 5, "aliran harus berisi frame, dapat " + frames);
    ok(`aliran live view: ${frames} frame MJPEG ke layar booth`);

    // jepret (aliran masih terbuka seperti di layar sesi)
    const cap = await fetch(B + "/api/camera/dslr/capture", { method: "POST" });
    const cj = await cap.json(); assert.strictEqual(cap.status, 200, JSON.stringify(cj));
    assert.ok(/^data:image\/jpeg;base64,/.test(cj.image) && Buffer.from(cj.image.split(",")[1], "base64")[0] === 0xff);
    ok("jepret lewat /api/camera/dslr/capture: data JPEG diterima");

    // profil Foto harus diterapkan SEBELUM jepret (ISO 100 dan f/8), profil Live (ISO 800) kembali sesudahnya
    const c = calls().split("\n");
    const iCap = c.findIndex((l) => /--capture-image-and-download/.test(l));
    const before = c.slice(0, iCap).join("\n");
    assert.ok(/SET iso=100/.test(before) && /SET aperture=8/.test(before), "profil Foto belum diterapkan sebelum jepret:\n" + c.join("\n"));
    ok("profil Foto (ISO 100, f/8) dikirim ke kamera sebelum jepret");
    await wait(4500);
    const afterCalls = calls().split("\n").slice(iCap).join("\n");
    assert.ok(/SET iso=800/.test(afterCalls), "profil Live (ISO 800) harus kembali sesudah jepret:\n" + afterCalls);
    ok("profil Live (ISO 800) kembali otomatis setelah jepret");
    assert.ok(!/CLAIM-FAIL/.test(calls()), "rebutan USB:\n" + calls().split("\n").filter((l) => /CLAIM/.test(l)).join("\n"));
    ok("tidak ada rebutan USB selama live view + profil + jepret");
    ac.abort();

    // setelah aliran ditutup & stop: gphoto2 tidak boleh tertinggal
    await fetch(B + "/api/camera/dslr/liveview/stop?keep=1", { method: "POST" }); await wait(4000);
    const left = require("child_process").spawnSync("pgrep", ["-f", "fake-gphoto2.js --stdout --capture-movie"]).stdout.toString().trim();
    assert.ok(!left, "proses live view tertinggal: " + left);
    ok("live view dimatikan bersih saat stop (tidak ada proses gphoto2 tertinggal)");

    srv.kill(); await wait(1500);
    const left2 = require("child_process").spawnSync("pgrep", ["-f", "fake-gphoto2.js"]).stdout.toString().trim();
    assert.ok(!left2, "proses gphoto2 tertinggal setelah backend berhenti: " + left2);
    ok("backend berhenti -> tidak ada proses gphoto2 yatim");
    process.exit(0);
  } catch (e) { console.error("GAGAL:", e && e.stack || e, "\n--- log backend:\n" + log.slice(-1200)); try { srv.kill(); } catch {} process.exit(1); }
})();

// Uji jembatan kamera gPhoto2 (Linux): pemecah JPEG, pembaca setelan, dan siklus live view / jepret / setelan memakai gphoto2 PALSU
// yang menegakkan aturan USB asli (satu proses saja yang boleh memegang kamera).
process.env.POPSNAP_DATA = require("fs").mkdtempSync(require("os").tmpdir() + "/gpb-");
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { takeJpeg, parseConfig, ENCODE, friendly, GphotoBridge } = require("../gphotoBridge");
const J = require("./fixtures/jpegs");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (m) => console.log("ok  " + m);

(async () => {
  // ---- 1. pemecah aliran JPEG: potongan acak, thumbnail EXIF, progresif, sampah di depan, ekor terpotong ----
  const v = J.variants();
  const stream = Buffer.concat([Buffer.from("sampah"), ...v, ...v, v[0].subarray(0, 700)]);
  for (const chunk of [1, 7, 333, 5000, stream.length]) {
    const got = []; let rx = Buffer.alloc(0);
    for (let o = 0; o < stream.length; o += chunk) {
      rx = Buffer.concat([rx, stream.subarray(o, o + chunk)]);
      for (let g = 0; g < 500; g++) { const r = takeJpeg(rx); if (!r) break; if (r.skip !== undefined) { rx = rx.subarray(r.skip); if (!r.skip) break; continue; } got.push(r.frame); rx = r.rest; }
    }
    assert.strictEqual(got.length, 6, `potongan ${chunk}: harus 6 frame, dapat ${got.length}`);
    got.forEach((f, i) => assert.ok(f.equals(v[i % 3]), `frame ${i} (potongan ${chunk}) tidak utuh`));
  }
  ok("pemecah JPEG: 6 frame utuh dari aliran (EXIF thumbnail, progresif, sampah, potongan 1 byte s/d penuh)");

  // ---- 2. pembaca setelan & kode ----
  const c = parseConfig("Label: ISO Speed\nReadonly: 0\nType: RADIO\nCurrent: 400\nChoice: 0 Auto\nChoice: 1 100\nChoice: 2 400\nEND\n");
  assert.deepStrictEqual([c.current, c.choices.length, c.readonly], ["400", 3, false]);
  assert.deepStrictEqual([ENCODE.iso("Auto"), ENCODE.iso("800"), ENCODE.iso("Lo 1")], ["0", "800", null]);
  assert.deepStrictEqual([ENCODE.av("5.6"), ENCODE.av("f/2.8"), ENCODE.av("x")], ["56", "28", null]);
  assert.deepStrictEqual([ENCODE.tv("1/125"), ENCODE.tv("0.5"), ENCODE.tv("30"), ENCODE.tv('2"'), ENCODE.tv("bulb"), ENCODE.tv("1/8000")], ["8000", "500000", "30000000", "2000000", "0", "125"]);
  assert.strictEqual(ENCODE.wb("Daylight"), ENCODE.wb("daylight "));
  assert.ok(/^\d{1,10}$/.test(ENCODE.wb("Auto")));
  assert.ok(/dipakai program lain/.test(friendly("*** Error (-53: 'Could not claim the USB device')")));
  assert.ok(/tidak terdeteksi/.test(friendly("*** Error: No camera found")));
  ok("pembaca setelan, kode angka (ISO / f x10 / mikrodetik / WB), pesan galat ramah");

  if (process.platform !== "linux") { console.log("lewati: bagian jembatan butuh Linux"); process.exit(0); }

  // ---- 3. siklus dengan gphoto2 palsu ----
  const D = fs.mkdtempSync(path.join(os.tmpdir(), "fakegp-"));
  const fresh = (extra = {}) => fs.writeFileSync(path.join(D, "state.json"), JSON.stringify({
    config: {
      iso: { label: "ISO Speed", current: "400", choices: ["Auto", "100", "200", "400", "800", "1600", "Lo 1"] },
      shutterspeed: { current: "1/125", choices: ["30", "1", "0.5", "1/4", "1/60", "1/125", "1/8000", "bulb"] },
      aperture: { current: "5.6", choices: ["3.5", "4", "5.6", "8"] },
      whitebalance: { current: "Auto", choices: ["Auto", "Daylight", "Flash"] },
      autoexposuremodedial: { current: "Manual", choices: ["Manual", "AV"] },
    }, ...extra }));
  fresh(); process.env.FAKE_GP_DIR = D; process.env.GPHOTO2_BIN = path.join(__dirname, "fixtures", "fake-gphoto2.js");
  const calls = () => (fs.existsSync(path.join(D, "calls.log")) ? fs.readFileSync(path.join(D, "calls.log"), "utf8") : "");
  const b = new GphotoBridge();

  await b.ensure();
  assert.ok(b.connected && /Canon EOS 600D/.test(b.camera));
  ok("kamera terdeteksi: " + b.camera);

  // live view
  b.send("LIVEVIEW_START");
  let n = 0; const t0 = Date.now();
  while (n < 8 && Date.now() - t0 < 5000) { await b.waitFrame(200); if (b.readFrameIfNew()) n++; }
  assert.ok(n >= 8, "live view harus menghasilkan frame, dapat " + n);
  ok(`live view: ${n} frame diterima (${b.bridgeFps || "?"} fps)`);

  // setelan saat live view jalan: harus berhenti dulu (aturan USB), tanpa 'claim' gagal
  const info = await b.camInfo();
  assert.deepStrictEqual(info.iso.cur, "400");
  assert.ok(info.iso.opts.some(([c, l]) => c === "800" && l === "800") && !info.iso.opts.some(([, l]) => l === "Lo 1"), "pilihan ISO tak valid dibuang");
  assert.ok(info.tv.opts.some(([c, l]) => c === "8000" && l === "1/125"));
  assert.strictEqual(info.manual, true);
  ok("camInfo: ISO/tv/av/wb + mode M terbaca dengan bentuk yang dipakai UI");

  const r = await b.camSet("", "iso", "800");
  assert.ok(r.ok && r.info.iso.cur === "800", JSON.stringify(r));
  assert.ok(/SET iso=800/.test(calls()));
  const r2 = await b.camSet("", "tv", "9000", { quiet: true }); // kode tak ada persis -> pilihan terdekat (1/125 = 8000)
  assert.ok(r2.ok && /SET shutterspeed=1\/125/.test(calls()), JSON.stringify(r2));
  const r3 = await b.camSet("", "iso", "abc");
  assert.ok(!r3.ok);
  ok("camSet: kode angka -> label kamera, terdekat bila kode asing, input tak valid ditolak");

  // jepret saat live view jalan
  const shot = await b.capture();
  assert.ok(shot[0] === 0xff && shot[1] === 0xd8 && shot.length > 1000);
  ok(`jepret: JPEG ${shot.length} byte diterima`);
  await wait(3200); // live view harus menyala lagi sendiri sesudah jepret
  let after = 0; const t1 = Date.now(); while (after < 3 && Date.now() - t1 < 4000) { await b.waitFrame(200); if (b.readFrameIfNew()) after++; }
  assert.ok(after >= 3, "live view harus kembali setelah jepret");
  ok("live view menyala lagi otomatis setelah jepret");

  // RAW+JPEG: pilih JPEG; RAW saja (CR2): pesan jelas; sibuk: dicoba ulang
  fresh({ rawPlusJpeg: true }); const s1 = await b.capture(); assert.ok(s1[0] === 0xff); ok("RAW+JPEG: JPEG yang dipakai");
  fresh({ rawOnly: true }); await assert.rejects(() => b.capture(), /CR2 saja/); ok("RAW saja (CR2): pesan 'atur ke JPEG'");
  fresh({ failBusy: 1 }); const s2 = await b.capture(); assert.ok(s2.length > 1000); ok("kamera sibuk sekali: jepret dicoba ulang dan berhasil");

  // tidak ada satu pun kegagalan 'claim' sepanjang uji (semua perintah bergiliran)
  assert.ok(!/CLAIM-FAIL/.test(calls()), "ada rebutan USB:\n" + calls().split("\n").filter((l) => /CLAIM/.test(l)).join("\n"));
  ok("tidak ada rebutan USB antar perintah gphoto2 (live view / setelan / jepret bergiliran)");

  // STOP + QUIT bersih
  b.send("LIVEVIEW_STOP"); await wait(800); assert.ok(!b.proc, "live view harus berhenti");
  fresh({ noCamera: true }); const b2 = new GphotoBridge(); await assert.rejects(() => b2.ensure(), /tidak terdeteksi|belum tersambung/); ok("tanpa kamera: galat yang jelas");
  b.stop(); await wait(500);
  console.log("SELESAI");
  process.exit(0);
})().catch((e) => { console.error("GAGAL:", e && e.stack || e); process.exit(1); });

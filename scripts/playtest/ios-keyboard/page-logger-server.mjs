#!/usr/bin/env node
// Serves a built apps/web bundle (emulator mode) on loopback and injects a tiny logger into index.html so a
// run in the iOS Simulator's REAL Mobile Safari can report the page's OWN visualViewport and correction-sheet
// geometry (what the accessibility tree cannot see: the keyboard's accessory bar, Safari's own chrome).
// Output: JSON lines in --log. Nothing else about the app changes, and nothing is written outside --log.
//
// It logs geometry, focus targets and the LENGTH of typed values only, never the values, and never the page
// URL (a route can carry a room code): secret-entry fields pass through the page while this runs.
//
// Usage: node page-logger-server.mjs --dir "${TMPDIR:-/tmp}/digitable-ios-dist" --port 4175 --log page-log.jsonl
import { createServer } from "node:http";
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const DIR = arg("dir");
const PORT = Number(arg("port", "4175"));
const LOG = arg("log", "page-log.jsonl");
writeFileSync(LOG, "");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
};

const PROBE_JS = `(function () {
  var seq = 0;
  function r(el) { if (!el) return null; var b = el.getBoundingClientRect(); return [Math.round(b.top * 10) / 10, Math.round(b.bottom * 10) / 10, Math.round(b.left), Math.round(b.right)]; }
  function find(re) { return [].slice.call(document.querySelectorAll('[role="dialog"] button')).filter(function (b) { return re.test(b.textContent); })[0]; }
  function send(kind, extra) {
    try {
      var vv = window.visualViewport, dlg = document.querySelector('[role="dialog"]'), body = dlg && dlg.querySelector('.sheet-body'), ae = document.activeElement;
      var backdrop = document.querySelector('.sheet-backdrop');
      var data = { t: Date.now(), seq: ++seq, kind: kind,
        iw: innerWidth, ih: innerHeight, vvw: vv && vv.width, vvh: vv && vv.height, vvt: vv && vv.offsetTop, vvl: vv && vv.offsetLeft, vvs: vv && vv.scale, sy: scrollY,
        orient: (screen.orientation && screen.orientation.type) || null,
        active: ae ? (ae.tagName + (ae.id ? '#' + ae.id : '')) : null,
        dialog: r(dlg), sheetBody: r(body), bodyClient: body ? body.clientHeight : null, bodyScroll: body ? body.scrollHeight : null, bodyTop: body ? body.scrollTop : null,
        header: r(dlg && dlg.querySelector('.sheet-header')), footer: r(dlg && dlg.querySelector('.sheet-footer')),
        field: r(document.getElementById('correction-reason')), label: r(document.querySelector('label[for="correction-reason"]')),
        apply: r(find(/apply correction/i)), cancel: r(find(/cancel/i)), backdrop: r(backdrop), backdropStyle: backdrop ? backdrop.style.cssText : null,
        compact: matchMedia('(max-height: 28rem)').matches, mode: dlg ? (getComputedStyle(dlg).overflowY === 'auto' ? 'single-scroll' : 'pinned') : null, sheetScrollTop: dlg ? Math.round(dlg.scrollTop) : null, sheetClientH: dlg ? dlg.clientHeight : null, sheetScrollH: dlg ? dlg.scrollHeight : null, rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize) };
      if (extra) for (var k in extra) data[k] = extra[k];
      navigator.sendBeacon('/__log', JSON.stringify(data));
    } catch (e) { navigator.sendBeacon('/__log', JSON.stringify({ kind: 'probe-error', msg: String(e) })); }
  }
  window.__probeSend = send;
  addEventListener('resize', function () { send('resize'); });
  addEventListener('orientationchange', function () { send('orientationchange'); });
  if (window.visualViewport) { visualViewport.addEventListener('resize', function () { send('vv-resize'); }); visualViewport.addEventListener('scroll', function () { send('vv-scroll'); }); }
  document.addEventListener('focusin', function (e) { send('focusin', { target: e.target && (e.target.tagName + (e.target.id ? '#' + e.target.id : '')) }); }, true);
  document.addEventListener('focusout', function () { send('focusout'); }, true);
  document.addEventListener('input', function (e) { var t = e.target; if (t && t.id) send('input', { target: t.id, length: String(t.value).length }); }, true);
  setInterval(function () { if (document.querySelector('[role="dialog"]')) send('tick'); }, 700);
  addEventListener('load', function () { send('load'); });
})();`;

createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "POST" && url.pathname === "/__log") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      appendFileSync(LOG, body + "\n");
      res.writeHead(204).end();
    });
    return;
  }
  if (url.pathname === "/__probe.js") {
    res.writeHead(200, { "content-type": MIME[".js"], "cache-control": "no-store" }).end(PROBE_JS);
    return;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    // A malformed %-escape is a bad request, not a reason to take the server down mid-run.
    res.writeHead(400).end("bad request");
    return;
  }
  let rel = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  let file = join(DIR, rel);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIR, "index.html");
  const type = MIME[extname(file)] ?? "application/octet-stream";
  let data = readFileSync(file);
  if (file.endsWith("index.html"))
    data = Buffer.from(
      data.toString("utf8").replace("</head>", '<script src="/__probe.js"></script></head>'),
    );
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(data);
}).listen(PORT, "127.0.0.1", () =>
  console.log(`page-logger-server on http://127.0.0.1:${PORT} -> ${DIR} (log ${LOG})`),
);

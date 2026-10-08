// Standalone CDP probe: opens probe.html at a layout size, optionally emulates the iOS-style
// "visual viewport shorter than layout viewport" by setting --vv-* the way useVisualViewportBox does,
// and reports whether the whole sheet footer + header are reachable inside the visible frame.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = Number(process.argv[2] ?? 47381);
const URL_ = process.argv[3];
const cases = JSON.parse(process.argv[4]);
const prof = mkdtempSync(join(tmpdir(), "hk-probe-"));
const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${prof}`,
    "--no-first-run",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws,
  id = 0;
const pend = new Map();
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const t = await (
        await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })
      ).json();
      ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((r, j) => {
        ws.onopen = r;
        ws.onerror = j;
      });
      ws.onmessage = (m) => {
        const d = JSON.parse(m.data);
        if (d.id && pend.has(d.id)) {
          pend.get(d.id)(d);
          pend.delete(d.id);
        }
      };
      return;
    } catch {
      await sleep(200);
    }
  }
  throw new Error("no chrome");
}
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;
};
const out = [];
try {
  await connect();
  for (const c of cases) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: c.w,
      height: c.h,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await send("Page.navigate", { url: URL_ });
    await sleep(500);
    await ev(
      `(()=>{const bd=document.getElementById('bd'); ${c.vv ? `bd.style.setProperty('--vv-height','${c.vv}px');bd.style.setProperty('--vv-top','0px');bd.style.setProperty('--vv-left','0px');bd.style.setProperty('--vv-width','${c.w}px');` : ""} })()`,
    );
    await sleep(700);
    const frameH = c.vv ?? c.h;
    await ev(
      `(()=>{const s=document.querySelector('.sheet');s.scrollTop=s.scrollHeight;const b=document.querySelector('.sheet-body');b.scrollTop=b.scrollHeight})()`,
    );
    const m =
      await ev(`(()=>{const r=(s)=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,h:b.height}};
      const body=document.querySelector('.sheet-body');
      const hit=(s)=>{const e=document.querySelector(s);const b=e.getBoundingClientRect();const pts=[[b.left+2,b.top+2],[b.right-2,b.top+2],[b.left+2,b.bottom-2],[b.right-2,b.bottom-2],[(b.left+b.right)/2,(b.top+b.bottom)/2]];return pts.every(([x,y])=>{const t=document.elementFromPoint(x,y);return t&&(t===e||e.contains(t))})};
      return {sheet:r('.sheet'),header:r('.sheet-header'),body:r('.sheet-body'),bodyClient:body.clientHeight,bodyScroll:body.scrollHeight,footer:r('.sheet-footer'),apply:r('#apply'),cancel:r('#cancel'),applyHit:hit('#apply'),cancelHit:hit('#cancel'),headerHit:hit('.sheet-header h2')}})()`);
    const inFrame = (b) => b && b.top >= -0.5 && b.bottom <= frameH + 0.5;
    const res = {
      scrolledToEnd: true,
      case: c.name,
      frameH,
      bodyVisibleH: Math.round(m.body.h),
      headerInFrame: inFrame(m.header),
      applyInFrame: inFrame(m.apply),
      cancelInFrame: inFrame(m.cancel),
      applyHit: m.applyHit,
      cancelHit: m.cancelHit,
      sheetH: Math.round(m.sheet.h),
      footerH: Math.round(m.footer.h),
      bodyScrolls: m.bodyScroll > m.bodyClient + 1,
    };
    out.push(res);
    const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 60 });
    writeFileSync(
      `/tmp/${process.argv[5] ?? "shot"}-${c.name}.jpg`,
      Buffer.from(shot.result.data, "base64"),
    );
  }
  console.log(JSON.stringify(out, null, 1));
} finally {
  chrome.kill();
}

// ============================================================================
// AGENTICO · APP REVEAL · 1920x1080 (16:9) · 120 BPM · 12 s · oscuro + acento naranja
// Icono -> prompt -> IDE (archivos, código, agente, permiso) -> icono -> lockup
// Pegar en AurDesigner > Ejecutar script (o run_script por MCP)
// ============================================================================
const W = 1920, H = 1080, T = 12
project_config({ name: "Agentico · App Reveal", size: { width: W, height: H } })
add_slide({ name: "App Reveal", background: "#09090B" })
set_duration(T)

// ---------------------------------------------------------------------------
// 1) LA FORMA (html + GSAP)
// ---------------------------------------------------------------------------
const C = { kw: "#A78BFA", str: "#86EFAC", fn: "#7DD3FC", tx: "#D4D4D8", p: "#71717A", tag: "#FCA5A5" }
const CODE = [
  [["import ", C.kw], ["{ useState } ", C.tx], ["from ", C.kw], ['"react"', C.str], [";", C.p]],
  [["import ", C.kw], ["{ TaskList } ", C.tx], ["from ", C.kw], ['"./TaskList"', C.str], [";", C.p]],
  [],
  [["export default function ", C.kw], ["App", C.fn], ["() {", C.p]],
  [["  const ", C.kw], ["[tasks, setTasks] = ", C.tx], ["useState", C.fn], ["([]);", C.p]],
  [["  const ", C.kw], ["add = (t) => ", C.tx], ["setTasks", C.fn], ["([...tasks, t]);", C.p]],
  [],
  [["  return ", C.kw], ["(", C.p]],
  [["    &lt;", C.p], ["main ", C.tag], ["className=", C.tx], ['"app"', C.str], ["&gt;", C.p]],
  [["      &lt;", C.p], ["h1", C.tag], ["&gt;", C.p], ["Mis tareas", C.tx], ["&lt;/", C.p], ["h1", C.tag], ["&gt;", C.p]],
  [["      &lt;", C.p], ["TaskList ", C.fn], ["items={tasks} onAdd={add} ", C.tx], ["/&gt;", C.p]],
  [["    &lt;/", C.p], ["main", C.tag], ["&gt;", C.p]],
  [["  );", C.p]],
  [["}", C.p]],
]
const CODE_HTML = CODE.map((toks, i) =>
  '<div class="ag-cl" style="top:' + (104 + i * 26) + 'px">' +
  '<span class="ag-ln">' + (i + 1) + '</span>' +
  toks.map(([s, c]) => '<span style="color:' + c + '">' + s + '</span>').join("") + '</div>').join("")

const FILES = [["src", 0, true], ["App.tsx", 1, false, true], ["TaskList.tsx", 1], ["TaskItem.tsx", 1], ["store.ts", 1], ["index.css", 1], ["package.json", 0]]
const FILES_HTML = FILES.map(([n, ind, dir, hl], i) =>
  '<div class="ag-file" style="top:' + (92 + i * 32) + 'px;padding-left:' + (16 + ind * 18) + 'px;' + (hl ? 'background:#1F1F23;color:#FAFAFA' : '') + '">' +
  '<span class="ag-fi" style="background:' + (dir ? '#52525B' : (hl ? '#D97757' : '#3F3F46')) + '"></span>' + n + '</div>').join("")

const SPARK = (s, sw) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64"><g stroke="#D97757" stroke-width="' + sw + '" stroke-linecap="round">' +
  '<line x1="32" y1="8" x2="32" y2="56"/><line x1="8" y1="32" x2="56" y2="32"/><line x1="15" y1="15" x2="49" y2="49"/><line x1="49" y1="15" x2="15" y2="49"/></g></svg>'

const HTML = `
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<style>
  .ag-root{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;
    font-family:Geist,Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;letter-spacing:-0.01em}
  .ag-glow{position:absolute;left:50%;top:50%;width:1600px;height:1000px;margin:-500px 0 0 -800px;opacity:0;
    background:radial-gradient(closest-side,rgba(217,119,87,0.22),rgba(217,119,87,0) 70%)}
  .ag-shape{position:relative;flex:none;width:160px;height:160px;border-radius:40px;background:#18181B;overflow:hidden;
    box-shadow:0 0 0 1px rgba(255,255,255,0.08),0 40px 120px rgba(0,0,0,0.55)}
  .ag-l{position:absolute;left:50%;top:50%;opacity:0}
  .ag-mono{font-family:'Geist Mono',ui-monospace,monospace}
  .ag-file{position:absolute;left:8px;right:8px;height:28px;border-radius:8px;display:flex;align-items:center;gap:10px;
    font-size:14px;color:#A1A1AA;box-sizing:border-box;opacity:0}
  .ag-fi{width:12px;height:12px;border-radius:3px;flex:none}
  .ag-cl{position:absolute;left:240px;height:26px;display:flex;align-items:center;white-space:pre;
    font:400 15px 'Geist Mono',ui-monospace,monospace;clip-path:inset(0 100% 0 0)}
  .ag-ln{display:inline-block;width:56px;padding-right:18px;text-align:right;color:#3F3F46;box-sizing:border-box}
  .ag-rv{clip-path:inset(0 100% 0 0)}
  .ag-ico{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
</style>
<div class="ag-root">
 <div class="ag-glow"></div>

 <!-- lockup (texto a la derecha del icono; el icono se desplaza x -250 -> abs 630..790) -->
 <div class="ag-word ag-rv" style="position:absolute;left:830px;top:452px;font-size:104px;font-weight:600;letter-spacing:-0.045em;color:#FAFAFA;line-height:1">Agentico</div>
 <div class="ag-tag" style="position:absolute;left:834px;top:572px;font-size:27px;color:#A1A1AA;opacity:0">El IDE donde los agentes construyen contigo.</div>

 <div class="ag-shape">

  <!-- A. icono de la app (160x160, centro abs 960,540) -->
  <div class="ag-l" data-l="icon" style="width:160px;height:160px;margin:-80px 0 0 -80px;opacity:1;display:flex;align-items:center;justify-content:center">
   <div class="ag-glyph" style="width:76px;height:76px">${SPARK(76, 6)}</div>
  </div>

  <!-- B. prompt (760x88, abs left 580; botón enviar centro abs 1296,540) -->
  <div class="ag-l" data-l="prompt" style="width:760px;height:88px;margin:-44px 0 0 -380px">
   <div style="position:absolute;left:30px;top:30px;width:28px;height:28px">${SPARK(28, 6)}</div>
   <div style="position:absolute;left:76px;top:0;height:88px;display:flex;align-items:center;font-size:26px;color:#FAFAFA;white-space:pre">
    <span class="ag-typed"></span><span class="ag-caret" style="width:2px;height:30px;background:#D97757;margin-left:2px"></span><span
      class="ag-ph" style="color:#52525B;margin-left:4px">¿Qué quieres construir?</span>
   </div>
   <div class="ag-send" style="position:absolute;right:16px;top:16px;width:56px;height:56px;border-radius:28px;background:#D97757;
     display:flex;align-items:center;justify-content:center;color:#09090B">
    <svg width="24" height="24" viewBox="0 0 24 24" class="ag-ico" style="stroke-width:2.5"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg>
   </div>
  </div>

  <!-- C. IDE (1400x800, abs left 260, top 140) -->
  <div class="ag-l" data-l="ide" style="width:1400px;height:800px;margin:-400px 0 0 -700px;background:#0F0F11">
   <!-- barra de título -->
   <div style="position:absolute;left:0;right:0;top:0;height:44px;border-bottom:1px solid #1F1F23">
    <i style="position:absolute;left:18px;top:16px;width:12px;height:12px;border-radius:6px;background:#3F3F46"></i>
    <i style="position:absolute;left:38px;top:16px;width:12px;height:12px;border-radius:6px;background:#3F3F46"></i>
    <i style="position:absolute;left:58px;top:16px;width:12px;height:12px;border-radius:6px;background:#3F3F46"></i>
    <div style="position:absolute;left:0;right:0;top:13px;text-align:center;font-size:14px;color:#71717A">mis-tareas — Agentico</div>
   </div>
   <!-- sidebar -->
   <div style="position:absolute;left:0;top:44px;width:240px;bottom:0;background:#121214;border-right:1px solid #1F1F23"></div>
   <div style="position:absolute;left:24px;top:62px;font-size:11px;letter-spacing:0.08em;color:#52525B;font-weight:600">EXPLORADOR</div>
   <div style="position:absolute;left:0;top:0;width:240px;height:800px">${FILES_HTML}</div>
   <!-- editor -->
   <div style="position:absolute;left:240px;top:44px;width:660px;height:40px;border-bottom:1px solid #1F1F23"></div>
   <div style="position:absolute;left:252px;top:52px;height:24px;padding:0 12px;border-radius:6px;background:#1F1F23;
     font-size:13px;color:#E4E4E7;display:flex;align-items:center;gap:8px"><i style="width:8px;height:8px;border-radius:4px;background:#D97757"></i>App.tsx</div>
   ${CODE_HTML}
   <!-- terminal -->
   <div style="position:absolute;left:240px;top:600px;width:660px;height:200px;background:#0B0B0D;border-top:1px solid #1F1F23"></div>
   <div style="position:absolute;left:264px;top:616px;font-size:11px;letter-spacing:0.08em;color:#52525B;font-weight:600">TERMINAL</div>
   <div class="ag-mono" style="position:absolute;left:264px;top:648px;font-size:15px;color:#A1A1AA">$ pnpm dev</div>
   <div class="ag-term ag-mono ag-rv" style="position:absolute;left:264px;top:676px;font-size:15px;color:#4ADE80;white-space:pre">✓ ready in 312 ms  <span style="color:#71717A">→ http://localhost:5173</span></div>
   <!-- chat del agente -->
   <div style="position:absolute;left:900px;top:44px;width:500px;bottom:0;background:#121214;border-left:1px solid #1F1F23"></div>
   <div style="position:absolute;left:924px;top:58px;font-size:14px;font-weight:600;color:#E4E4E7;display:flex;align-items:center;gap:8px">
    <i class="ag-dot" style="width:8px;height:8px;border-radius:4px;background:#D97757"></i>Agente</div>
   <div class="ag-ub" style="position:absolute;right:24px;top:104px;padding:12px 16px;border-radius:16px 16px 4px 16px;background:#27272A;
     font-size:15px;color:#FAFAFA;opacity:0">Crea una app de tareas con React</div>
   <div class="ag-am" style="position:absolute;left:924px;top:172px;width:24px;height:24px;opacity:0">${SPARK(22, 6)}</div>
   <div class="ag-a ag-rv" style="position:absolute;left:960px;top:172px;font-size:15px;color:#E4E4E7;white-space:pre">Voy a crear la estructura del proyecto:</div>
   <div class="ag-a ag-rv ag-mono" style="position:absolute;left:960px;top:204px;font-size:14px;color:#A1A1AA;white-space:pre">+ src/App.tsx</div>
   <div class="ag-a ag-rv ag-mono" style="position:absolute;left:960px;top:228px;font-size:14px;color:#A1A1AA;white-space:pre">+ src/TaskList.tsx</div>
   <div class="ag-a ag-rv ag-mono" style="position:absolute;left:960px;top:252px;font-size:14px;color:#A1A1AA;white-space:pre">+ src/store.ts</div>
   <!-- tarjeta de permiso (local 924,470 · 452x150; "Permitir" centro abs 1552,718) -->
   <div class="ag-card" style="position:absolute;left:924px;top:470px;width:452px;height:150px;border-radius:16px;background:#18181B;
     box-shadow:inset 0 0 0 1px #3F3F46;opacity:0">
    <svg width="20" height="20" viewBox="0 0 24 24" class="ag-ico" style="position:absolute;left:20px;top:22px;color:#D97757">
     <path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>
    <div style="position:absolute;left:52px;top:20px;font-size:16px;font-weight:600;color:#FAFAFA">Editar App.tsx</div>
    <div class="ag-mono" style="position:absolute;left:52px;top:46px;font-size:13px;color:#71717A"><span style="color:#4ADE80">+14</span> líneas · src/App.tsx</div>
    <div style="position:absolute;left:196px;top:86px;width:100px;height:44px;border-radius:12px;box-shadow:inset 0 0 0 1px #3F3F46;
      display:flex;align-items:center;justify-content:center;font-size:15px;color:#A1A1AA">Rechazar</div>
    <div class="ag-allow" style="position:absolute;left:308px;top:86px;width:120px;height:44px;border-radius:12px;background:#D97757;
      display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;color:#09090B">Permitir</div>
   </div>
   <div class="ag-ok" style="position:absolute;left:924px;top:470px;width:452px;height:56px;border-radius:14px;background:rgba(74,222,128,0.1);
     box-shadow:inset 0 0 0 1px rgba(74,222,128,0.3);display:flex;align-items:center;gap:10px;padding:0 18px;box-sizing:border-box;
     font-size:15px;font-weight:500;color:#4ADE80;opacity:0">
    <svg width="20" height="20" viewBox="0 0 24 24" class="ag-ico"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.2l2.4 2.4 4.6-4.9"/></svg>
    Cambios aplicados · App.tsx</div>
   <!-- input del chat -->
   <div style="position:absolute;left:924px;top:728px;width:452px;height:48px;border-radius:14px;background:#18181B;
     box-shadow:inset 0 0 0 1px #27272A;font-size:14px;color:#52525B;display:flex;align-items:center;padding-left:16px;box-sizing:border-box">Pregunta al agente…</div>
  </div>

 </div>
</div>`

const GSAP = `
(() => {
const R = (document.currentScript && document.currentScript.parentElement) || document;
const $ = (s) => R.querySelector(s), $$ = (s) => Array.from(R.querySelectorAll(s));
const L = (n) => R.querySelector('[data-l="' + n + '"]');
function springEase(zeta, k) {
  const w = k / zeta, wd = w * Math.sqrt(1 - zeta * zeta);
  const f = (p) => 1 - Math.exp(-zeta * w * p) * (Math.cos(wd * p) + (zeta * w / wd) * Math.sin(wd * p));
  const end = f(1);
  return (p) => (p >= 1 ? 1 : f(p) / end);
}
const SP = springEase(0.87, 7), FAST = springEase(0.9, 8), SOFT = springEase(0.95, 6);
const shape = $('.ag-shape'), glyph = $('.ag-glyph'), glow = $('.ag-glow');
const tl = gsap.timeline();
const morph = (t, p, dur) => tl.to(shape, Object.assign({ duration: dur || 0.5, ease: SP }, p), t);
const out = (el, t) => tl.to(el, { opacity: 0, filter: 'blur(8px)', scale: 0.96, duration: 0.12, ease: 'power2.in' }, t);
const inn = (el, t, d) => tl.fromTo(el, { opacity: 0, filter: 'blur(8px)', scale: 1.04 },
  { opacity: 1, filter: 'blur(0px)', scale: 1, duration: d || 0.24, ease: FAST, immediateRender: false }, t + 0.06);
const swap = (a, b, t) => { out(L(a), t); inn(L(b), t); };
const reveal = (el, t, d) => tl.to(el, { clipPath: 'inset(0 0% 0 0)', duration: d || 0.3, ease: 'power2.out' }, t);
const press = (el, t, s) => { tl.to(el, { scale: s || 0.96, duration: 0.08, ease: 'power2.out' }, t); tl.to(el, { scale: 1, duration: 0.42, ease: SP }, t + 0.08); };

// 1.1 · aparece el icono
tl.fromTo(shape, { scale: 0 }, { scale: 1, duration: 0.6, ease: SP }, 0.3);
tl.fromTo(glyph, { rotation: -90, scale: 0.6 }, { rotation: 0, scale: 1, duration: 0.7, ease: SP }, 0.35);

// 1.3 · clic en el icono
press(shape, 1.0, 0.92);
tl.to(glyph, { rotation: 45, duration: 0.5, ease: SP }, 1.0);

// 2.1 · icono -> barra de prompt
morph(1.5, { width: 760, height: 88, borderRadius: 44 });
swap('icon', 'prompt', 1.5);

// 2.2 · tecleo del prompt
const typed = $('.ag-typed'), q = { n: 0 }, Q = 'Crea una app de tareas con React';
const paintQ = () => { typed.textContent = Q.slice(0, Math.round(q.n)); };
tl.to($('.ag-ph'), { opacity: 0, duration: 0.05 }, 1.9);
tl.to(q, { n: Q.length, duration: 0.96, ease: 'none', onUpdate: paintQ }, 1.9);

// 2.4 · enviar
press($('.ag-send'), 3.0, 0.88);
tl.to($('.ag-caret'), { opacity: 0, duration: 0.1 }, 3.0);

// 3.1 · prompt -> IDE
morph(3.5, { width: 1400, height: 800, borderRadius: 24, backgroundColor: '#0F0F11' }, 0.6);
swap('prompt', 'ide', 3.5);
tl.to(glow, { opacity: 1, duration: 0.8, ease: 'power2.out' }, 3.5);

// 3.2 · archivos, mensaje del usuario, respuesta del agente
$$('.ag-file').forEach((el, i) => inn(el, 3.7 + i * 0.06));
inn($('.ag-ub'), 3.8);
inn($('.ag-am'), 4.05);
$$('.ag-a').forEach((el, i) => reveal(el, 4.1 + i * 0.18, i ? 0.25 : 0.45));

// 3.3 · el código se escribe línea a línea
$$('.ag-cl').forEach((el, i) => reveal(el, 4.3 + i * 0.075, 0.28));

// 3.4 · pide permiso
inn($('.ag-card'), 4.9, 0.3);

// 4.1 · Permitir
press($('.ag-allow'), 5.5, 0.9);
out($('.ag-card'), 5.6);
inn($('.ag-ok'), 5.6);

// 4.2 · el dev server arranca
reveal($('.ag-term'), 6.2, 0.4);
tl.to($('.ag-dot'), { backgroundColor: '#4ADE80', duration: 0.2 }, 6.2);

// 4.4 · IDE -> icono
morph(7.5, { width: 160, height: 160, borderRadius: 40, backgroundColor: '#18181B' }, 0.6);
swap('ide', 'icon', 7.5);
tl.to(glow, { scale: 0.45, opacity: 0.8, duration: 0.6, ease: SP }, 7.5);

// 5.1 · lockup: el icono se aparta, entra la marca
tl.to(shape, { x: -250, duration: 0.6, ease: SP }, 8.0);
tl.to(glow, { x: 30, duration: 0.6, ease: SP }, 8.0);
tl.to(glyph, { rotation: 90, duration: 0.7, ease: SP }, 8.0);
tl.fromTo($('.ag-word'), { x: -24 }, { x: 0, clipPath: 'inset(0 0% 0 0)', duration: 0.6, ease: 'power3.out', immediateRender: false }, 8.1);
inn($('.ag-tag'), 8.35, 0.4);
tl.to(glow, { scale: 0.55, opacity: 1, duration: 3.0, ease: 'sine.inOut' }, 9.0);
})();
`
add_html_gsap(HTML, GSAP, { x: 0, y: 0, w: W, h: H, dur: T })

// ---------------------------------------------------------------------------
// 2) CURSOR
// ---------------------------------------------------------------------------
const SPR = "spring(300,30,1)"
const REST = [1320, 820]
const cur = add_cursor({ at: REST, size: 22, style: "arrow" })
motion_blur(cur, { shutter: 0.5 })
const go = (t, x, y, dur = 0.45) => { at(t); PointerMove(x, y, { dur, ease: "inOutCubic", bow: 0, over: false, trail: false }) }
const down = (t) => { at(t); resize(cur, { to: [19, 19], anchor: [0, 0], dur: 0.08, ease: "outCubic" }) }
const up = (t) => { at(t); resize(cur, { to: [22, 22], anchor: [0, 0], dur: 0.3, ease: SPR }) }
const click = (t) => { down(t); up(t + 0.08) }

go(0.55, 965, 548); click(1.0)          // icono
go(1.5, 1140, 640)                      // se aparta mientras se escribe
go(2.55, 1298, 542); click(3.0)         // enviar
go(3.5, 1300, 880, 0.6)                 // fuera del IDE
go(5.0, 1552, 720); click(5.5)          // Permitir
go(6.4, 1880, 1040, 0.7)                // sale del encuadre
at(7.1); hide(cur, { dur: 0.2 })

// ---------------------------------------------------------------------------
// 3) CAMARA
// ---------------------------------------------------------------------------
at(0); camera({ to: [960, 540], zoom: 2.0, dur: 0 })
const cam = (t, to, zoom, dur = 0.5, ease = SPR) => { at(t); camera({ to, zoom, dur, ease }) }
cam(1.5, [960, 540], 1.5)               // prompt
cam(3.5, [960, 540], 1.0, 0.6)          // IDE completo
cam(4.9, [1280, 620], 1.5, 0.6)         // punch-in a la tarjeta de permiso
cam(6.0, [960, 540], 1.0, 0.6)          // vuelve al IDE
cam(7.5, [960, 540], 1.6, 0.6)          // icono
cam(8.0, [990, 540], 1.6, 0.6)          // lockup
cam(8.6, [990, 540], 1.72, 3.4, "inOutSine")  // push lento hasta el final

// ---------------------------------------------------------------------------
// 4) SONIDO
// ---------------------------------------------------------------------------
const SND = (t, preset, o = {}) => sfx(preset, { at: t, volume: 0.6, ...o })
SND(0.3, "pop", { volume: 0.45 })
SND(1.0, "click")
SND(1.45, "swoosh", { volume: 0.35 })
for (let i = 0; i < 32; i += 2) SND(1.9 + i * 0.03, "key", { seed: i + 1, volume: 0.3, pitch: (i % 3) - 1 })
SND(3.0, "click", { pitch: 2 })
SND(3.45, "whoosh", { volume: 0.4 })
SND(4.9, "pop", { volume: 0.45 })
SND(5.5, "click")
SND(5.62, "success", { volume: 0.5 })
SND(6.2, "tick", { volume: 0.35 })
SND(6.8, "riser", { volume: 0.25 })
SND(7.45, "swoosh", { volume: 0.35 })
SND(8.0, "impact", { volume: 0.55 })

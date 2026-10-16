// ============================================================================
// AGENTICO · APP REVEAL 30 s · 1920x1080 (16:9) · 120 BPM (60 beats)
// Una sola forma: icono -> prompt -> IDE (IA respondiendo + código) -> diagramas
// -> dominios + DNS -> vista móvil -> constelación de features -> icono -> lockup
// Pegar en AurDesigner > Ejecutar script (o run_script por MCP)
// ============================================================================
const W = 1920, H = 1080, T = 30
project_config({ name: "Agentico · Reveal 30s", size: { width: W, height: H } })
add_slide({ name: "Reveal 30s", background: "#09090B" })
set_duration(T)

// ---------------------------------------------------------------------------
// Helpers de HTML (se ejecutan aquí, generan strings)
// ---------------------------------------------------------------------------
const ACC = "#D97757"
const SPARK = (s, sw) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64"><g stroke="' + ACC + '" stroke-width="' + sw + '" stroke-linecap="round">' +
  '<line x1="32" y1="8" x2="32" y2="56"/><line x1="8" y1="32" x2="56" y2="32"/><line x1="15" y1="15" x2="49" y2="49"/><line x1="49" y1="15" x2="15" y2="49"/></g></svg>'
const ICO = (d, s, st) => '<svg width="' + (s || 22) + '" height="' + (s || 22) + '" viewBox="0 0 24 24" class="ag-ico" style="' + (st || '') + '">' + d + '</svg>'
const I = {
  code: '<path d="M8 6l-6 6 6 6M16 6l6 6-6 6"/>',
  diag: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><path d="M6.5 10v4a3 3 0 0 0 3 3H14"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  db: '<ellipse cx="12" cy="5.5" rx="8" ry="2.5"/><path d="M4 5.5v13c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-13M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5"/>',
  git: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M18 10.5c0 4-6 3-11 5.5"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  task: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 12.2l2.6 2.6 5.4-5.6"/>',
  remote: '<path d="M5 12.5a10 10 0 0 1 14 0M8 15.5a5.5 5.5 0 0 1 8 0"/><circle cx="12" cy="18.5" r="1.2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  ext: '<path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5"/>',
}
const RAIL = [I.code, I.diag, I.globe, I.db, I.git, I.phone]

// chip de herramienta (spinner -> check)
const CHIP = (cls, top, txt) =>
  '<div class="ag-chip ' + cls + '" style="top:' + top + 'px">' +
  '<svg width="20" height="20" viewBox="0 0 20 20" style="position:absolute;left:12px;top:10px">' +
  '<circle class="sp" cx="10" cy="10" r="7" fill="none" stroke="' + ACC + '" stroke-width="2" stroke-linecap="round" pathLength="1" stroke-dasharray="0.3 1"/>' +
  '<path class="ck" d="M5.5 10.5l3 3 6-6.5" fill="none" stroke="#4ADE80" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>' +
  '<span class="tx">' + txt + '</span></div>'
const UB = (txt, extra) => '<div class="ag-ub" style="' + (extra || '') + '">' + txt + '</div>'
const ALINE = (cls, top, txt, st) => '<div class="ag-al ag-rv ' + cls + '" style="top:' + top + 'px;' + (st || '') + '">' + txt + '</div>'
const AICON = (top) => '<div class="ag-ai" style="top:' + top + 'px">' + SPARK(18, 6) + '</div>'

// código (Hero.tsx)
const K = { kw: "#A78BFA", str: "#86EFAC", fn: "#7DD3FC", tx: "#D4D4D8", p: "#71717A", tag: "#FCA5A5" }
const CODE = [
  [["export function ", K.kw], ["Hero", K.fn], ["() {", K.p]],
  [["  return ", K.kw], ["(", K.p]],
  [["    &lt;", K.p], ["section ", K.tag], ["className=", K.tx], ['"hero"', K.str], ["&gt;", K.p]],
  [["      &lt;", K.p], ["h1", K.tag], ["&gt;", K.p], ["Café Luna", K.tx], ["&lt;/", K.p], ["h1", K.tag], ["&gt;", K.p]],
  [["      &lt;", K.p], ["p", K.tag], ["&gt;", K.p], ["Café de especialidad, tostado cada mañana.", K.tx], ["&lt;/", K.p], ["p", K.tag], ["&gt;", K.p]],
  [["      &lt;", K.p], ["a ", K.tag], ["href=", K.tx], ['"/pedido" ', K.str], ["className=", K.tx], ['"btn"', K.str], ["&gt;", K.p], ["Pedir ahora", K.tx], ["&lt;/", K.p], ["a", K.tag], ["&gt;", K.p]],
  [["      &lt;", K.p], ["Menu ", K.fn], ["items={cafes} ", K.tx], ["/&gt;", K.p]],
  [["    &lt;/", K.p], ["section", K.tag], ["&gt;", K.p]],
  [["  );", K.p]],
  [["}", K.p]],
]
const CODE_HTML = CODE.map((toks, i) =>
  '<div class="ag-cl" style="top:' + (64 + i * 28) + 'px"><i class="ag-diff"></i><span class="ag-ln">' + (i + 1) + '</span>' +
  toks.map(([s, c]) => '<span style="color:' + c + '">' + s + '</span>').join("") + '</div>').join("")

// diagrama (coords del stage)
const NODE = (cls, x, y, t, s, c) =>
  '<div class="ag-node ' + cls + '" style="left:' + x + 'px;top:' + y + 'px"><i style="background:' + c + '"></i>' +
  '<b>' + t + '</b><span class="ag-mono">' + s + '</span></div>'
const EDGES = ["M260 374L330 374", "M530 374C575 374 575 214 620 214", "M530 374L620 374", "M530 374C575 374 575 534 620 534", "M720 408C720 594 600 594 530 594"]

// dominios
const DOM = [["cafeluna.com", true, "$9.99"], ["cafeluna.app", true, "$14.99"], ["cafeluna.dev", false, ""], ["cafeluna.store", true, "$2.99"]]
const DOM_HTML = DOM.map(([n, ok, pr], i) =>
  '<div class="ag-drow" style="top:' + (144 + i * 68) + 'px;' + (ok ? '' : 'opacity:0.55') + '">' +
  '<span class="ag-mono" style="position:absolute;left:20px;top:19px;font-size:16px;color:#FAFAFA">' + n + '</span>' +
  '<span class="ag-pill" style="left:250px;top:17px;' + (ok ? 'color:#4ADE80;background:rgba(74,222,128,0.1)' : 'color:#F87171;background:rgba(248,113,113,0.1)') + '">' + (ok ? 'Disponible' : 'Ocupado') + '</span>' +
  (ok ? '<span class="ag-mono" style="position:absolute;left:560px;top:20px;font-size:14px;color:#A1A1AA">' + pr + ' / año</span>' +
    '<div class="ag-reg' + (i === 0 ? ' ag-reg0' : '') + '" style="' + (i === 0 ? 'background:' + ACC + ';color:#09090B' : 'box-shadow:inset 0 0 0 1px #3F3F46;color:#A1A1AA') + '">' +
    '<span class="r1">Registrar</span>' + (i === 0 ? '<span class="r2">Registrado</span>' : '') + '</div>' : '') + '</div>').join("")
const DNS = [["A", "@", "76.76.21.21", "3600"], ["CNAME", "www", "cafeluna.com", "3600"], ["MX", "@", "mx1.hostinger.com", "14400"], ["TXT", "@", '"v=spf1 include:_spf.mail…"', "3600"]]
const DNS_HTML = DNS.map(([ty, n, v, ttl], i) =>
  '<div class="ag-dns ag-mono" style="top:' + (300 + i * 48) + 'px"><span class="ag-ty">' + ty + '</span><span style="left:130px">' + n +
  '</span><span style="left:240px;color:#E4E4E7">' + v + '</span><span style="left:760px;color:#71717A">' + ttl + '</span></div>').join("")
const REG = ["NA", "SA", "EU", "AF", "AS", "OC"]
const REG_HTML = REG.map((r, i) => '<div class="ag-reg-dot" style="left:' + (32 + i * 146) + 'px"><i></i><span class="ag-mono">' + r + '</span></div>').join("")

// gauges (vista móvil)
const GAUGE = (y, label, v) =>
  '<div style="position:absolute;left:690px;top:' + y + 'px;width:200px;height:80px">' +
  '<svg width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="32" fill="none" stroke="#1F1F23" stroke-width="6"/>' +
  '<circle class="ag-gc" cx="40" cy="40" r="32" fill="none" stroke="#4ADE80" stroke-width="6" stroke-linecap="round" transform="rotate(-90 40 40)" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" data-v="' + v + '"/></svg>' +
  '<div class="ag-gn ag-mono" data-v="' + v + '" style="position:absolute;left:0;top:28px;width:80px;text-align:center;font-size:20px;color:#FAFAFA">0</div>' +
  '<div style="position:absolute;left:98px;top:30px;font-size:15px;color:#A1A1AA">' + label + '</div></div>'

// badges de la constelación (coords abs de la slide)
const BADGES = [[110, 190, I.git, "Git", "feat: landing · a3f9c21"], [80, 502, I.db, "Base de datos", "Postgres · 6 tablas"], [110, 814, I.task, "Tareas", "8 de 8 completadas"],
  [1540, 190, I.diag, "Diagramas", "Mermaid · UML · Grafo"], [1570, 502, I.globe, "Dominios", "cafeluna.com · Activo"], [1540, 814, I.remote, "Remoto", "Controla desde el móvil"]]
const BADGES_HTML = BADGES.map(([x, y, ic, t, s]) =>
  '<div class="ag-badge" style="left:' + x + 'px;top:' + y + 'px"><div class="ag-bi">' + ICO(ic, 22) + '</div>' +
  '<b>' + t + '</b><span class="ag-mono">' + s + '</span></div>').join("")

const Q1 = "Crea la landing de Café Luna y publícala en cafeluna.com"

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------
const HTML = `
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<style>
 .ag-root{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;
   font-family:Geist,Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;letter-spacing:-0.01em;color:#E4E4E7}
 .ag-bgdots{position:absolute;inset:0;opacity:0;background-image:radial-gradient(rgba(255,255,255,0.06) 1px,transparent 1px);background-size:32px 32px}
 .ag-glow{position:absolute;left:50%;top:50%;width:1800px;height:1100px;margin:-550px 0 0 -900px;opacity:0;
   background:radial-gradient(closest-side,rgba(217,119,87,0.22),rgba(217,119,87,0) 70%)}
 .ag-shape{position:relative;flex:none;width:160px;height:160px;border-radius:40px;background:#18181B;overflow:hidden;
   box-shadow:0 0 0 1px rgba(255,255,255,0.08),0 16px 40px rgba(0,0,0,0.35)}
 .ag-l{position:absolute;left:50%;top:50%;opacity:0}
 .ag-mono{font-family:'Geist Mono',ui-monospace,monospace}
 .ag-ico{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
 .ag-rv{clip-path:inset(0 100% 0 0)}
 .ag-w{position:absolute;left:0;right:0;top:668px;text-align:center;font-size:58px;font-weight:600;letter-spacing:-0.04em;color:#FAFAFA;opacity:0}
 /* IDE */
 .ag-ri{position:absolute;left:12px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;color:#71717A;opacity:0}
 .ag-ind{position:absolute;left:12px;width:40px;top:64px;bottom:736px;border-radius:12px;background:rgba(217,119,87,0.16);
   box-shadow:inset 0 0 0 1px rgba(217,119,87,0.35);opacity:0}
 .ag-stage{position:absolute;left:64px;top:44px;width:936px;height:796px;opacity:0}
 .ag-chat{position:absolute;left:1000px;top:44px;width:500px;height:680px;opacity:0}
 .ag-ub{position:absolute;right:24px;top:20px;max-width:340px;padding:12px 16px;border-radius:16px 16px 4px 16px;background:#27272A;
   font-size:15px;line-height:1.45;color:#FAFAFA}
 .ag-ai{position:absolute;left:24px;width:18px;height:18px}
 .ag-al{position:absolute;left:54px;font-size:15px;color:#E4E4E7;white-space:pre;line-height:20px}
 .ag-shim{background:linear-gradient(90deg,#52525B 0%,#52525B 35%,#FAFAFA 50%,#52525B 65%,#52525B 100%);background-size:200% 100%;
   background-position:100% 0;-webkit-background-clip:text;background-clip:text;color:transparent}
 .ag-chip{position:absolute;left:24px;width:452px;height:40px;border-radius:10px;background:#18181B;box-shadow:inset 0 0 0 1px #27272A;opacity:0}
 .ag-chip .tx{position:absolute;left:42px;top:11px;font-size:14px;color:#A1A1AA;white-space:pre}
 /* código */
 .ag-cl{position:absolute;left:0;height:28px;display:flex;align-items:center;white-space:pre;font:400 15px 'Geist Mono',ui-monospace,monospace;clip-path:inset(0 100% 0 0)}
 .ag-ln{display:inline-block;width:62px;padding-right:20px;text-align:right;color:#3F3F46;box-sizing:border-box}
 .ag-diff{position:absolute;left:4px;top:4px;width:3px;height:20px;border-radius:2px;background:#4ADE80;opacity:0.7}
 /* diagrama */
 .ag-node{position:absolute;width:200px;height:68px;border-radius:14px;background:#18181B;box-shadow:inset 0 0 0 1px #3F3F46;opacity:0}
 .ag-node i{position:absolute;left:16px;top:16px;width:10px;height:10px;border-radius:3px}
 .ag-node b{position:absolute;left:36px;top:11px;font-size:15px;font-weight:600;color:#FAFAFA}
 .ag-node span{position:absolute;left:36px;top:36px;font-size:12px;color:#71717A}
 /* dominios */
 .ag-drow{position:absolute;left:32px;width:872px;height:60px;border-radius:12px;background:#141416;box-shadow:inset 0 0 0 1px #232327;opacity:0}
 .ag-pill{position:absolute;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:500}
 .ag-reg{position:absolute;left:740px;top:12px;width:116px;height:36px;border-radius:10px;font-size:14px;font-weight:600;overflow:hidden}
 .ag-reg span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
 .ag-reg .r2{opacity:0;color:#4ADE80}
 .ag-dns{position:absolute;left:32px;width:872px;height:40px;border-bottom:1px solid #1F1F23;font-size:14px;color:#A1A1AA;clip-path:inset(0 100% 0 0)}
 .ag-dns span{position:absolute;top:11px}
 .ag-ty{left:16px;padding:2px 8px;border-radius:6px;background:#1F1F23;color:${ACC};top:8px !important}
 .ag-reg-dot{position:absolute;top:560px;width:120px;height:40px;opacity:0}
 .ag-reg-dot i{position:absolute;left:0;top:14px;width:12px;height:12px;border-radius:6px;background:#3F3F46}
 .ag-reg-dot span{position:absolute;left:22px;top:11px;font-size:13px;color:#71717A}
 /* badges */
 .ag-badge{position:absolute;width:270px;height:76px;border-radius:18px;background:rgba(24,24,27,0.85);
   box-shadow:0 0 0 1px rgba(255,255,255,0.08),0 20px 60px rgba(0,0,0,0.5);opacity:0}
 .ag-bi{position:absolute;left:14px;top:14px;width:48px;height:48px;border-radius:13px;background:rgba(217,119,87,0.14);color:${ACC};
   display:flex;align-items:center;justify-content:center}
 .ag-badge b{position:absolute;left:76px;top:16px;font-size:16px;font-weight:600;color:#FAFAFA}
 .ag-badge span{position:absolute;left:76px;top:42px;font-size:12.5px;color:#A1A1AA;white-space:nowrap}
</style>
<div class="ag-root">
 <div class="ag-bgdots"></div>
 <div class="ag-glow"></div>

 <!-- intro: palabras bajo el icono -->
 <div class="ag-w">Escribe.</div><div class="ag-w">Diseña.</div><div class="ag-w">Publica.</div>

 <!-- constelación -->
 ${BADGES_HTML}

 <!-- lockup (icono desplazado x -340 -> abs 540..700) -->
 <div class="ag-word ag-rv" style="position:absolute;left:740px;top:440px;padding:0 8px 22px 0;font-size:112px;font-weight:600;letter-spacing:-0.045em;color:#FAFAFA;line-height:1">Agentico</div>
 <div class="ag-tag" style="position:absolute;left:744px;top:572px;font-size:28px;color:#A1A1AA;opacity:0">El IDE donde los agentes construyen contigo.</div>
 <div class="ag-feat ag-mono ag-rv" style="position:absolute;left:745px;top:624px;font-size:16px;color:#71717A;letter-spacing:0.02em;white-space:pre">Código  ·  Diagramas  ·  Dominios  ·  Bases de datos  ·  Git  ·  Móvil</div>

 <div class="ag-shape">

  <!-- A. icono -->
  <div class="ag-l" data-l="icon" style="width:160px;height:160px;margin:-80px 0 0 -80px;opacity:1;display:flex;align-items:center;justify-content:center">
   <div class="ag-glyph" style="width:76px;height:76px">${SPARK(76, 6)}</div>
  </div>

  <!-- B. prompt 820x92 (abs left 550; enviar centro abs 1324,540) -->
  <div class="ag-l" data-l="prompt" style="width:820px;height:92px;margin:-46px 0 0 -410px">
   <div style="position:absolute;left:32px;top:32px;width:28px;height:28px">${SPARK(28, 6)}</div>
   <div style="position:absolute;left:78px;top:0;height:92px;display:flex;align-items:center;font-size:24px;color:#FAFAFA;white-space:pre">
    <span class="ag-typed"></span><span class="ag-caret" style="width:2px;height:28px;background:${ACC};margin-left:2px"></span><span
     class="ag-ph" style="color:#52525B;margin-left:4px">¿Qué quieres construir hoy?</span></div>
   <div class="ag-send" style="position:absolute;right:16px;top:16px;width:60px;height:60px;border-radius:30px;background:${ACC};
     display:flex;align-items:center;justify-content:center;color:#09090B">${ICO('<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>', 24, 'stroke-width:2.6')}</div>
  </div>

  <!-- C. IDE 1500x840 (abs left 210, top 120). rail icon i centro abs (242, 204+56i) -->
  <div class="ag-l" data-l="ide" style="width:1500px;height:840px;margin:-420px 0 0 -750px;background:#0F0F11">
   <div style="position:absolute;left:0;right:0;top:0;height:44px;border-bottom:1px solid #1F1F23">
    <i style="position:absolute;left:18px;top:16px;width:12px;height:12px;border-radius:6px;background:#3F3F46"></i>
    <i style="position:absolute;left:38px;top:16px;width:12px;height:12px;border-radius:6px;background:#3F3F46"></i>
    <i style="position:absolute;left:58px;top:16px;width:12px;height:12px;border-radius:6px;background:#3F3F46"></i>
    <div style="position:absolute;left:0;right:0;top:13px;text-align:center;font-size:14px;color:#71717A">cafe-luna — Agentico</div>
   </div>
   <div style="position:absolute;left:0;top:44px;width:64px;bottom:0;background:#121214;border-right:1px solid #1F1F23"></div>
   <div class="ag-ind"></div>
   ${RAIL.map((d, i) => '<div class="ag-ri" style="top:' + (64 + i * 56) + 'px">' + ICO(d, 22) + '</div>').join('')}

   <!-- STAGE 1 · código (stage abs origin 274,164) -->
   <div class="ag-stage" data-s="code">
    <div style="position:absolute;left:0;right:0;top:0;height:40px;border-bottom:1px solid #1F1F23"></div>
    <div style="position:absolute;left:12px;top:8px;height:24px;padding:0 12px;border-radius:6px;background:#1F1F23;font-size:13px;color:#E4E4E7;
      display:flex;align-items:center;gap:8px"><i style="width:8px;height:8px;border-radius:4px;background:${ACC}"></i>Hero.tsx<span style="color:#4ADE80" class="ag-mono">+10</span></div>
    ${CODE_HTML}
    <div style="position:absolute;left:0;top:580px;width:936px;height:216px;background:#0B0B0D;border-top:1px solid #1F1F23"></div>
    <div style="position:absolute;left:24px;top:596px;font-size:11px;letter-spacing:0.08em;color:#52525B;font-weight:600">TERMINAL</div>
    <div class="ag-t1 ag-mono ag-rv" style="position:absolute;left:24px;top:630px;font-size:15px;color:#A1A1AA;white-space:pre">$ pnpm build</div>
    <div class="ag-t2 ag-mono ag-rv" style="position:absolute;left:24px;top:658px;font-size:15px;color:#71717A;white-space:pre">vite v5.4  building for production…  48 modules</div>
    <div class="ag-t3 ag-mono ag-rv" style="position:absolute;left:24px;top:686px;font-size:15px;color:#4ADE80;white-space:pre">✓ built in 1.2s   <span style="color:#71717A">dist/  142 kB  ·  gzip 46 kB</span></div>
   </div>

   <!-- STAGE 2 · diagrama -->
   <div class="ag-stage" data-s="diag" style="background-image:radial-gradient(rgba(255,255,255,0.07) 1px,transparent 1px);background-size:24px 24px">
    <div style="position:absolute;left:32px;top:26px;font-size:18px;font-weight:600;color:#FAFAFA">Arquitectura <span style="color:#71717A;font-weight:400">· cafe-luna</span></div>
    <div style="position:absolute;right:32px;top:20px;width:270px;height:36px;border-radius:10px;background:#18181B;box-shadow:inset 0 0 0 1px #27272A;
      display:flex;font-size:13px;color:#71717A">
     <div style="position:absolute;left:4px;top:4px;width:86px;height:28px;border-radius:7px;background:#27272A"></div>
     <span style="position:relative;flex:1;display:flex;align-items:center;justify-content:center;color:#FAFAFA">Mermaid</span>
     <span style="flex:1;display:flex;align-items:center;justify-content:center">UML</span>
     <span style="flex:1;display:flex;align-items:center;justify-content:center">Grafo</span>
    </div>
    <svg width="936" height="796" viewBox="0 0 936 796" style="position:absolute;left:0;top:0">
     ${EDGES.map((d) => '<path class="ag-edge" d="' + d + '" fill="none" stroke="#52525B" stroke-width="2" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>').join('')}
     ${EDGES.map((d) => '<path class="ag-flow" d="' + d + '" fill="none" stroke="' + ACC + '" stroke-width="3" stroke-linecap="round" pathLength="1" stroke-dasharray="0.08 0.92" stroke-dashoffset="0" style="opacity:0"/>').join('')}
    </svg>
    ${NODE('n0', 60, 340, 'Cliente', 'web · React', '#7DD3FC')}
    ${NODE('n1', 330, 340, 'API Gateway', 'hono · /api', ACC)}
    ${NODE('n2', 620, 180, 'Auth', 'jwt · sesiones', '#A78BFA')}
    ${NODE('n3', 620, 340, 'Pedidos', 'orders.ts', '#FCD34D')}
    ${NODE('n4 ag-pagos', 620, 500, 'Pagos', 'stripe.ts', '#4ADE80')}
    ${NODE('n5', 330, 560, 'Postgres', 'db · 6 tablas', '#60A5FA')}
    <div class="ag-tip" style="position:absolute;left:620px;top:424px;width:200px;height:60px;border-radius:12px;background:#FAFAFA;color:#09090B;opacity:0">
     <div style="position:absolute;left:14px;top:10px;font-size:13px;font-weight:600">stripe.ts</div>
     <div class="ag-mono" style="position:absolute;left:14px;top:32px;font-size:12px;color:#52525B">3 endpoints · 98% tests</div>
    </div>
   </div>

   <!-- STAGE 3 · dominios ("Registrar" .com centro abs 1104,338) -->
   <div class="ag-stage" data-s="dom">
    <div style="position:absolute;left:32px;top:26px;font-size:18px;font-weight:600;color:#FAFAFA">Dominios</div>
    <div style="position:absolute;right:32px;top:22px;display:flex;gap:8px;font-size:13px">
     <span style="padding:6px 12px;border-radius:999px;background:rgba(217,119,87,0.14);color:${ACC};display:flex;align-items:center;gap:6px"><i style="width:6px;height:6px;border-radius:3px;background:#4ADE80"></i>Hostinger</span>
     <span style="padding:6px 12px;border-radius:999px;background:#18181B;color:#71717A">GoDaddy</span>
     <span style="padding:6px 12px;border-radius:999px;background:#18181B;color:#71717A">Namecheap</span>
    </div>
    <div style="position:absolute;left:32px;top:72px;width:872px;height:52px;border-radius:12px;background:#141416;box-shadow:inset 0 0 0 1px #2A2A2E">
     ${ICO(I.search, 20, 'position:absolute;left:18px;top:16px;color:#71717A')}
     <div style="position:absolute;left:52px;top:0;height:52px;display:flex;align-items:center;font-size:17px;color:#FAFAFA;white-space:pre" class="ag-mono">
      <span class="ag-dtyped"></span><span style="width:2px;height:22px;background:${ACC};margin-left:2px"></span><span class="ag-dph" style="color:#52525B;margin-left:4px">Buscar dominio…</span></div>
     <span class="ag-mono" style="position:absolute;right:18px;top:17px;font-size:13px;color:#52525B">.com .app .dev .store</span>
    </div>
    ${DOM_HTML}
    <div class="ag-dnsh" style="position:absolute;left:32px;top:236px;width:872px;height:30px;opacity:0">
     <span style="font-size:15px;font-weight:600;color:#FAFAFA">Registros DNS</span><span class="ag-mono" style="margin-left:10px;font-size:13px;color:#71717A">cafeluna.com</span>
     <span class="ag-st1 ag-pill" style="right:0;left:auto;top:0;color:#FCD34D;background:rgba(252,211,77,0.1)">● Propagando…</span>
     <span class="ag-st2 ag-pill" style="right:0;left:auto;top:0;color:#4ADE80;background:rgba(74,222,128,0.12);opacity:0">● Activo</span>
    </div>
    <div class="ag-dnsh ag-mono" style="position:absolute;left:32px;top:276px;width:872px;height:16px;font-size:11px;letter-spacing:0.08em;color:#52525B;opacity:0">
     <span style="position:absolute;left:16px">TIPO</span><span style="position:absolute;left:130px">NOMBRE</span>
     <span style="position:absolute;left:240px">VALOR</span><span style="position:absolute;left:760px">TTL</span></div>
    ${DNS_HTML}
    <div class="ag-dnsh" style="position:absolute;left:32px;top:520px;font-size:13px;color:#71717A;opacity:0">Propagación global</div>
    ${REG_HTML}
   </div>

   <!-- STAGE 4 · vista móvil -->
   <div class="ag-stage" data-s="phone">
    <div style="position:absolute;left:32px;top:26px;font-size:18px;font-weight:600;color:#FAFAFA">Vista previa <span style="color:#71717A;font-weight:400">· iPhone</span></div>
    <div style="position:absolute;left:318px;top:93px;width:300px;height:610px;border-radius:46px;background:#000;box-shadow:0 0 0 1px #3F3F46,0 30px 80px rgba(0,0,0,0.6)">
     <div style="position:absolute;left:10px;top:10px;width:280px;height:590px;border-radius:37px;overflow:hidden;background:#120C08">
      <div class="ag-pc" style="position:absolute;left:0;top:0;width:280px">
       <div style="position:absolute;left:0;top:0;width:280px;height:360px;background:linear-gradient(160deg,#5A3B28 0%,#24170F 70%)"></div>
       <div style="position:absolute;left:0;top:0;width:280px;height:360px;background:radial-gradient(circle at 80% 30%,rgba(217,119,87,0.45),transparent 55%)"></div>
       <div style="position:absolute;left:22px;top:150px;font-size:34px;font-weight:600;letter-spacing:-0.03em;color:#F5E6D3">Café Luna</div>
       <div style="position:absolute;left:22px;top:196px;width:220px;font-size:14px;line-height:1.4;color:#C9B8A6">Café de especialidad, tostado cada mañana.</div>
       <div style="position:absolute;left:22px;top:262px;padding:11px 20px;border-radius:999px;background:${ACC};color:#120C08;font-size:14px;font-weight:600">Pedir ahora</div>
       <div style="position:absolute;left:22px;top:392px;font-size:17px;font-weight:600;color:#F5E6D3">Nuestros cafés</div>
       <div style="position:absolute;left:22px;top:428px;width:112px;height:140px;border-radius:18px;background:linear-gradient(180deg,#3A271B,#1E140D)"></div>
       <div style="position:absolute;left:146px;top:428px;width:112px;height:140px;border-radius:18px;background:linear-gradient(180deg,#4A3324,#1E140D)"></div>
       <div style="position:absolute;left:34px;top:540px;font-size:12px;color:#F5E6D3">Etiopía</div>
       <div style="position:absolute;left:158px;top:540px;font-size:12px;color:#F5E6D3">Colombia</div>
       <div style="position:absolute;left:22px;top:584px;width:236px;height:140px;border-radius:18px;background:linear-gradient(180deg,#3A271B,#1E140D)"></div>
      </div>
      <div style="position:absolute;left:0;top:0;width:280px;height:84px;background:linear-gradient(180deg,rgba(18,12,8,0.95) 60%,rgba(18,12,8,0))"></div>
      <div style="position:absolute;left:95px;top:10px;width:90px;height:26px;border-radius:13px;background:#000"></div>
      <div style="position:absolute;left:20px;top:46px;width:240px;height:30px;border-radius:15px;background:rgba(255,255,255,0.1);
        display:flex;align-items:center;justify-content:center;gap:6px;font-size:13px;color:#F5E6D3">${ICO(I.lock, 12)}cafeluna.com</div>
     </div>
    </div>
    ${GAUGE(160, 'Rendimiento', 98)}${GAUGE(300, 'Accesibilidad', 100)}${GAUGE(440, 'SEO', 100)}
   </div>

   <!-- CHAT 1 · IA construye -->
   <div class="ag-chat" data-c="c1" style="opacity:1">
    ${UB(Q1, 'opacity:0')}
    ${AICON(104)}
    <div class="ag-al ag-think ag-shim" style="top:103px;opacity:0">Pensando…</div>
    ${ALINE('c1a', 103, 'Perfecto. Creo la landing con React')}
    ${ALINE('c1a', 125, 'y la dejo lista para publicar.')}
    ${CHIP('c1k', 168, 'Leyendo proyecto · 12 archivos')}
    ${CHIP('c1k', 216, 'Creando src/Hero.tsx')}
    ${CHIP('c1k', 264, 'Ejecutando pnpm build')}
    ${ALINE('c1b', 324, 'Listo. ¿Genero el diagrama de arquitectura?', 'left:24px')}
   </div>

   <!-- CHAT 2 · diagrama -->
   <div class="ag-chat" data-c="c2">
    ${UB('Muéstrame la arquitectura')}
    ${AICON(84)}
    <div class="ag-al ag-shim c2s" style="top:83px">Analizando <span class="ag-n48">0</span> archivos…</div>
    <div style="position:absolute;left:54px;top:112px;width:400px;height:4px;border-radius:2px;background:#1F1F23">
     <div class="ag-pbar" style="width:0;height:4px;border-radius:2px;background:${ACC}"></div></div>
    ${ALINE('c2a', 136, 'Generé el diagrama de arquitectura:')}
    ${ALINE('c2a ag-mono', 160, '6 módulos · 5 dependencias · 0 ciclos', 'font-size:13px;color:#A1A1AA')}
    ${CHIP('c2k', 200, 'Exportado a docs/arquitectura.mmd')}
   </div>

   <!-- CHAT 3 · dominios -->
   <div class="ag-chat" data-c="c3">
    ${UB('Conecta el dominio cafeluna.com')}
    ${AICON(84)}
    ${ALINE('c3a', 83, 'Busco disponibilidad y configuro el DNS.')}
    ${CHIP('c3k', 120, 'Buscando en Hostinger · 4 TLDs')}
    ${CHIP('c3k', 168, 'Registrando cafeluna.com')}
    ${CHIP('c3k', 216, 'Configurando DNS · 4 registros')}
    ${ALINE('c3b', 276, 'cafeluna.com ya apunta a tu deploy.', 'left:24px')}
   </div>

   <!-- CHAT 4 · publicado -->
   <div class="ag-chat" data-c="c4">
    ${UB('Enséñamela en el móvil')}
    ${AICON(84)}
    ${ALINE('c4a', 83, 'Listo. Ya está en línea:')}
    <div class="c4p" style="position:absolute;left:54px;top:116px;padding:9px 14px;border-radius:10px;background:rgba(217,119,87,0.14);color:${ACC};
      font-size:14px;font-weight:500;display:flex;align-items:center;gap:8px;opacity:0">${ICO(I.globe, 16)}cafeluna.com${ICO(I.ext, 14)}</div>
    <div class="c4p ag-mono" style="position:absolute;left:54px;top:164px;padding:9px 14px;border-radius:10px;background:#18181B;box-shadow:inset 0 0 0 1px #27272A;
      font-size:13px;color:#A1A1AA;display:flex;align-items:center;gap:8px;opacity:0">${ICO(I.git, 15)}<span style="color:${ACC}">a3f9c21</span> feat: landing Café Luna</div>
    ${CHIP('c4k', 216, 'Tests · 12 de 12')}
   </div>

   <div style="position:absolute;left:1024px;top:740px;width:452px;height:52px;border-radius:14px;background:#18181B;box-shadow:inset 0 0 0 1px #27272A;
     font-size:14px;color:#52525B;display:flex;align-items:center;padding-left:16px;box-sizing:border-box">Pregunta al agente…</div>
   <div style="position:absolute;left:1000px;top:44px;width:1px;height:796px;background:#1F1F23"></div>
  </div>

 </div>
</div>`

// ---------------------------------------------------------------------------
// GSAP
// ---------------------------------------------------------------------------
const GSAP = `
(() => {
const R = (document.currentScript && document.currentScript.parentElement) || document;
const $ = (s) => R.querySelector(s), $$ = (s) => Array.from(R.querySelectorAll(s));
const L = (n) => R.querySelector('[data-l="' + n + '"]');
const S = (n) => R.querySelector('[data-s="' + n + '"]');
const CH = (n) => R.querySelector('[data-c="' + n + '"]');
function springEase(zeta, k) {
  const w = k / zeta, wd = w * Math.sqrt(1 - zeta * zeta);
  const f = (p) => 1 - Math.exp(-zeta * w * p) * (Math.cos(wd * p) + (zeta * w / wd) * Math.sin(wd * p));
  const end = f(1);
  return (p) => (p >= 1 ? 1 : f(p) / end);
}
const SP = springEase(0.87, 7), FAST = springEase(0.9, 8), SOFT = springEase(0.95, 6);
const shape = $('.ag-shape'), glyph = $('.ag-glyph'), glow = $('.ag-glow'), ide = L('ide');
const tl = gsap.timeline();
const morph = (t, p, dur) => tl.to(shape, Object.assign({ duration: dur || 0.5, ease: SP }, p), t);
const out = (el, t) => tl.to(el, { opacity: 0, filter: 'blur(8px)', scale: 0.96, duration: 0.12, ease: 'power2.in' }, t);
const inn = (el, t, d) => tl.fromTo(el, { opacity: 0, filter: 'blur(8px)', scale: 1.04 },
  { opacity: 1, filter: 'blur(0px)', scale: 1, duration: d || 0.24, ease: FAST, immediateRender: false }, t + 0.06);
const swap = (a, b, t) => { out(a, t); inn(b, t); };
const reveal = (el, t, d, e) => tl.to(el, { clipPath: 'inset(0 0% 0 0)', duration: d || 0.3, ease: e || 'power2.out' }, t);
const press = (el, t, s) => { tl.to(el, { scale: s || 0.96, duration: 0.08, ease: 'power2.out' }, t); tl.to(el, { scale: 1, duration: 0.42, ease: SP }, t + 0.08); };
const shimmer = (el, t, d) => tl.fromTo(el, { backgroundPosition: '100% 0' }, { backgroundPosition: '-100% 0', duration: 0.9, ease: 'none',
  repeat: Math.max(0, Math.ceil(d / 0.9) - 1), immediateRender: false }, t);
const chip = (el, t0, t1) => {
  inn(el, t0);
  const sp = el.querySelector('.sp');
  tl.fromTo(sp, { rotation: 0 }, { rotation: 360 * Math.max(1, Math.round((t1 - t0) / 0.6)), svgOrigin: '10 10', duration: t1 - t0, ease: 'none', immediateRender: false }, t0);
  tl.to(sp, { opacity: 0, duration: 0.1 }, t1);
  tl.to(el.querySelector('.ck'), { attr: { 'stroke-dashoffset': 0 }, duration: 0.3, ease: 'power3.out' }, t1);
  tl.to(el.querySelector('.tx'), { color: '#E4E4E7', duration: 0.2 }, t1);
};
const typer = (el, txt, t, d) => { const o = { n: 0 }; tl.to(o, { n: txt.length, duration: d, ease: 'none',
  onUpdate: () => { el.textContent = txt.slice(0, Math.round(o.n)); } }, t); };
// indicador líquido del rail (borde delantero rápido, trasero suave)
const ri = $$('.ag-ri'), ind = $('.ag-ind');
let cur = 0;
const railTo = (j, t) => {
  const top = 64 + j * 56, bot = 736 - j * 56;
  if (j > cur) { tl.to(ind, { bottom: bot, duration: 0.3, ease: FAST }, t); tl.to(ind, { top: top, duration: 0.45, ease: SOFT }, t); }
  else { tl.to(ind, { top: top, duration: 0.3, ease: FAST }, t); tl.to(ind, { bottom: bot, duration: 0.45, ease: SOFT }, t); }
  tl.to(ri[cur], { color: '#71717A', duration: 0.2 }, t + 0.05);
  tl.to(ri[j], { color: '#FAFAFA', duration: 0.2 }, t + 0.05);
  cur = j;
};

// ===== 0 · INTRO (0 – 3) =====
tl.to($('.ag-bgdots'), { opacity: 1, duration: 1.5, ease: 'power1.out' }, 0);
tl.to(glow, { opacity: 0.55, scale: 0.4, duration: 0 }, 0);
tl.fromTo(shape, { scale: 0 }, { scale: 1, duration: 0.6, ease: SP }, 0.25);
tl.fromTo(glyph, { rotation: -90, scale: 0.6 }, { rotation: 0, scale: 1, duration: 0.7, ease: SP }, 0.3);
const words = $$('.ag-w');
inn(words[0], 0.7); out(words[0], 1.2); inn(words[1], 1.2); out(words[1], 1.7); inn(words[2], 1.7); out(words[2], 2.4);
tl.to(glyph, { rotation: 45, duration: 0.45, ease: SP }, 1.2);
tl.to(glyph, { rotation: 90, duration: 0.45, ease: SP }, 1.7);
press(shape, 2.5, 0.92);

// ===== 1 · PROMPT (3 – 5.5) =====
morph(3.0, { width: 820, height: 92, borderRadius: 46 });
swap(L('icon'), L('prompt'), 3.0);
tl.to($('.ag-ph'), { opacity: 0, duration: 0.05 }, 3.3);
typer($('.ag-typed'), '${Q1}', 3.3, 1.45);
press($('.ag-send'), 5.0, 0.88);
tl.to($('.ag-caret'), { opacity: 0, duration: 0.1 }, 5.0);

// ===== 2 · IDE + IA construye (5.5 – 11.5) =====
morph(5.5, { width: 1500, height: 840, borderRadius: 22, backgroundColor: '#0F0F11' }, 0.65);
swap(L('prompt'), ide, 5.5);
tl.to(shape, { boxShadow: '0 0 0 1px rgba(255,255,255,0.08),0 50px 140px rgba(0,0,0,0.6)', duration: 0.6, ease: 'power2.out' }, 5.5);
tl.to(glow, { opacity: 1, scale: 1, duration: 0.9, ease: 'power2.out' }, 5.5);
ri.forEach((el, i) => inn(el, 5.8 + i * 0.05));
inn(ind, 5.8); tl.to(ri[0], { color: '#FAFAFA', duration: 0.2 }, 5.85);
inn(S('code'), 5.75, 0.3);
inn(CH('c1').querySelector('.ag-ub'), 5.75);
inn($('.ag-think'), 5.95);
shimmer($('.ag-think'), 5.95, 0.9);
out($('.ag-think'), 6.6);
const c1a = $$('.c1a');
reveal(c1a[0], 6.62, 0.4, 'power1.inOut'); reveal(c1a[1], 6.95, 0.3, 'power1.inOut');
const c1k = $$('.c1k');
chip(c1k[0], 7.15, 7.65); chip(c1k[1], 7.65, 8.75); chip(c1k[2], 8.75, 9.7);
$$('.ag-cl').forEach((el, i) => reveal(el, 7.75 + i * 0.1, 0.3));
reveal($('.ag-t1'), 8.8, 0.25); reveal($('.ag-t2'), 9.05, 0.45, 'none'); reveal($('.ag-t3'), 9.7, 0.3);
reveal($('.c1b'), 10.2, 0.5, 'power1.inOut');

// ===== 3 · DIAGRAMA (11.5 – 16.5) =====
railTo(1, 11.5);
swap(S('code'), S('diag'), 11.5);
swap(CH('c1'), CH('c2'), 11.5);
shimmer($('.c2s'), 11.6, 1.0);
const n48 = $('.ag-n48'), nf = { n: 0 };
tl.to(nf, { n: 48, duration: 0.9, ease: 'power1.inOut', onUpdate: () => { n48.textContent = Math.round(nf.n); } }, 11.65);
tl.to($('.ag-pbar'), { width: 400, duration: 0.9, ease: 'power1.inOut' }, 11.65);
$$('.ag-node').forEach((el, i) => tl.fromTo(el, { opacity: 0, scale: 0.8, filter: 'blur(6px)' },
  { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.45, ease: SP, immediateRender: false }, 12.0 + i * 0.09));
$$('.ag-edge').forEach((el, i) => tl.to(el, { attr: { 'stroke-dashoffset': 0 }, duration: 0.5, ease: 'power2.inOut' }, 12.5 + i * 0.1));
$$('.ag-flow').forEach((el, i) => {
  tl.to(el, { opacity: 1, duration: 0.2 }, 13.2 + i * 0.08);
  tl.fromTo(el, { attr: { 'stroke-dashoffset': 0 } }, { attr: { 'stroke-dashoffset': -2 }, duration: 3.2, ease: 'none', immediateRender: false }, 13.2 + i * 0.08);
});
$$('.c2a').forEach((el, i) => reveal(el, 12.7 + i * 0.3, 0.4, 'power1.inOut'));
chip($('.c2k'), 13.4, 14.0);
// hover en Pagos
tl.to($('.ag-pagos'), { boxShadow: 'inset 0 0 0 2px ${ACC}', scale: 1.04, duration: 0.3, ease: SP }, 14.5);
inn($('.ag-tip'), 14.5);
tl.fromTo($('.ag-tip'), { y: 10 }, { y: 0, duration: 0.4, ease: SP, immediateRender: false }, 14.56);
out($('.ag-tip'), 15.9);
tl.to($('.ag-pagos'), { boxShadow: 'inset 0 0 0 1px #3F3F46', scale: 1, duration: 0.3, ease: SP }, 15.9);

// ===== 4 · DOMINIOS (16.5 – 22) =====
railTo(2, 16.5);
swap(S('diag'), S('dom'), 16.5);
swap(CH('c2'), CH('c3'), 16.5);
reveal($('.c3a'), 16.7, 0.45, 'power1.inOut');
tl.to($('.ag-dph'), { opacity: 0, duration: 0.05 }, 16.95);
typer($('.ag-dtyped'), 'cafeluna', 16.95, 0.4);
const c3k = $$('.c3k');
chip(c3k[0], 17.0, 17.6);
$$('.ag-drow').forEach((el, i) => { inn(el, 17.5 + i * 0.07); tl.fromTo(el, { y: 12 }, { y: 0, duration: 0.45, ease: SP, immediateRender: false }, 17.56 + i * 0.07); });
const reg0 = $('.ag-reg0');
press(reg0, 18.5, 0.9);
tl.to(reg0, { backgroundColor: 'rgba(74,222,128,0.12)', duration: 0.25 }, 18.55);
tl.to(reg0.querySelector('.r1'), { opacity: 0, y: -10, duration: 0.15 }, 18.55);
tl.fromTo(reg0.querySelector('.r2'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: FAST, immediateRender: false }, 18.6);
chip(c3k[1], 18.6, 19.1);
const rows = $$('.ag-drow');
[3, 2, 1].forEach((k, i) => out(rows[k], 19.0 + i * 0.04));
$$('.ag-dnsh').forEach((el, i) => inn(el, 19.2 + i * 0.05));
chip(c3k[2], 19.25, 20.6);
$$('.ag-dns').forEach((el, i) => reveal(el, 19.4 + i * 0.12, 0.35));
$$('.ag-reg-dot').forEach((el, i) => {
  inn(el, 19.85 + i * 0.03);
  tl.to(el.querySelector('i'), { backgroundColor: '#4ADE80', boxShadow: '0 0 0 4px rgba(74,222,128,0.18)', duration: 0.25, ease: FAST }, 20.1 + i * 0.15);
});
tl.to($('.ag-st1'), { opacity: 0.45, duration: 0.3, ease: 'sine.inOut', repeat: 3, yoyo: true }, 19.4);
swap($('.ag-st1'), $('.ag-st2'), 21.0);
reveal($('.c3b'), 21.05, 0.45, 'power1.inOut');

// ===== 5 · MÓVIL + CONSTELACIÓN (22 – 26) =====
railTo(5, 22.0);
swap(S('dom'), S('phone'), 22.0);
swap(CH('c3'), CH('c4'), 22.0);
reveal($('.c4a'), 22.2, 0.35, 'power1.inOut');
$$('.c4p').forEach((el, i) => inn(el, 22.45 + i * 0.15));
chip($('.c4k'), 22.75, 23.3);
tl.fromTo(S('phone').children[1], { y: 40 }, { y: 0, duration: 0.6, ease: SP, immediateRender: false }, 22.06);
tl.to($('.ag-pc'), { y: -130, duration: 1.4, ease: 'power2.inOut' }, 23.0);
$$('.ag-gc').forEach((el, i) => {
  const v = +el.getAttribute('data-v') / 100;
  tl.to(el, { attr: { 'stroke-dashoffset': 1 - v }, duration: 0.9, ease: 'power2.out' }, 22.4 + i * 0.12);
});
$$('.ag-gn').forEach((el, i) => {
  const v = +el.getAttribute('data-v'), o = { n: 0 };
  tl.to(o, { n: v, duration: 0.9, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(o.n); } }, 22.4 + i * 0.12);
});
// la ventana se encoge y aparecen las features alrededor
morph(23.5, { width: 1100, height: 616, borderRadius: 18 }, 0.6);
tl.to(ide, { scale: 1100 / 1500, duration: 0.6, ease: SP }, 23.5);
tl.to(glow, { scale: 1.15, duration: 0.8, ease: SP }, 23.5);
$$('.ag-badge').forEach((el, i) => {
  const left = i < 3;
  tl.fromTo(el, { opacity: 0, x: left ? 60 : -60, scale: 0.9, filter: 'blur(8px)' },
    { opacity: 1, x: 0, scale: 1, filter: 'blur(0px)', duration: 0.55, ease: SP, immediateRender: false }, 23.75 + i * 0.1);
  tl.to(el, { y: i % 2 ? 8 : -8, duration: 1.0, ease: 'sine.inOut', repeat: 1, yoyo: true }, 24.3 + i * 0.06);
});

// ===== 6 · LOCKUP (26 – 30) =====
$$('.ag-badge').forEach((el, i) => tl.to(el, { opacity: 0, x: i < 3 ? 120 : -120, scale: 0.85, filter: 'blur(10px)', duration: 0.3, ease: 'power2.in' }, 26.0 + i * 0.03));
morph(26.2, { width: 160, height: 160, borderRadius: 40, backgroundColor: '#18181B' }, 0.6);
tl.to(ide, { opacity: 0, filter: 'blur(8px)', scale: 0.6, duration: 0.15, ease: 'power2.in' }, 26.2);
inn(L('icon'), 26.25);
tl.to(shape, { boxShadow: '0 0 0 1px rgba(255,255,255,0.08),0 16px 40px rgba(0,0,0,0.35)', duration: 0.6, ease: 'power2.out' }, 26.2);
tl.to(glow, { scale: 0.5, opacity: 0.85, duration: 0.6, ease: SP }, 26.2);
tl.to(glyph, { rotation: 180, duration: 0.8, ease: SP }, 26.3);
tl.to(shape, { x: -340, duration: 0.65, ease: SP }, 26.9);
tl.to(glow, { x: 100, duration: 0.65, ease: SP }, 26.9);
tl.fromTo($('.ag-word'), { x: -30 }, { x: 0, clipPath: 'inset(0 0% 0 0)', duration: 0.7, ease: 'power3.out', immediateRender: false }, 27.0);
inn($('.ag-tag'), 27.35, 0.45);
reveal($('.ag-feat'), 27.75, 0.9, 'power2.inOut');
tl.to(glow, { scale: 0.6, opacity: 1, duration: 2.0, ease: 'sine.inOut' }, 28.0);
})();
`
add_html_gsap(HTML, GSAP, { x: 0, y: 0, w: W, h: H, dur: T })

// ---------------------------------------------------------------------------
// CURSOR
// ---------------------------------------------------------------------------
const SPR = "spring(300,30,1)"
const REST = [1380, 840]
const cur = add_cursor({ at: REST, size: 22, style: "arrow" })
motion_blur(cur, { shutter: 0.5 })
const go = (t, x, y, dur = 0.45) => { at(t); PointerMove(x, y, { dur, ease: "inOutCubic", bow: 0, over: false, trail: false }) }
const down = (t) => { at(t); resize(cur, { to: [19, 19], anchor: [0, 0], dur: 0.08, ease: "outCubic" }) }
const up = (t) => { at(t); resize(cur, { to: [22, 22], anchor: [0, 0], dur: 0.3, ease: SPR }) }
const click = (t) => { down(t); up(t + 0.08) }
const rail = (i) => [242, 204 + i * 56]

go(2.05, 965, 548); click(2.5)                      // icono
go(3.0, 1160, 660)                                  // se aparta mientras escribe
go(4.55, 1326, 542); click(5.0)                     // enviar
go(5.5, 1260, 905, 0.6)                             // reposo dentro del IDE
go(11.05, ...rail(1)); click(11.5)                  // diagrama
go(14.05, 994, 700)                                 // hover Pagos
go(16.05, ...rail(2)); click(16.5)                  // dominios
go(18.05, 1104, 340); click(18.5)                   // Registrar
go(19.2, 1180, 760, 0.6)                            // se aparta
go(21.55, ...rail(5)); click(22.0)                  // vista móvil
go(22.5, 1420, 1010, 0.7)                           // sale
at(23.3); hide(cur, { dur: 0.2 })

// ---------------------------------------------------------------------------
// CÁMARA (zoom con spring; tilt 3D sutil en el diagrama)
// ---------------------------------------------------------------------------
at(0); camera({ to: [960, 575], zoom: 1.7, dur: 0 })
const cam = (t, to, zoom, dur = 0.55, ease = SPR, tilt = [0, 0]) => { at(t); camera({ to, zoom, tilt, dur, ease }) }
cam(3.0, [960, 540], 1.4)                           // prompt
cam(5.5, [960, 540], 1.0, 0.65)                     // IDE
cam(6.0, [1258, 500], 1.45, 0.6)                    // la IA piensa
cam(7.75, [760, 480], 1.35, 0.6)                    // el código se escribe
cam(9.7, [960, 540], 1.0, 0.6)                      // vista completa
cam(12.0, [880, 540], 1.12, 0.8, SPR, [5, -3])      // diagrama con tilt
cam(14.3, [960, 600], 1.35, 0.6)                    // hover Pagos
cam(16.0, [960, 540], 1.0, 0.5)
cam(17.2, [768, 440], 1.35, 0.6)                    // resultados de dominios
cam(19.2, [768, 560], 1.3, 0.6)                     // DNS + propagación
cam(20.9, [1234, 500], 1.4, 0.5)                    // "activo" en el chat
cam(21.6, [960, 540], 1.0, 0.45)
cam(22.15, [768, 560], 1.25, 0.6)                   // móvil + gauges
cam(23.5, [960, 540], 1.0, 0.6)                     // constelación
cam(24.2, [960, 540], 1.06, 1.8, "inOutSine", [-3, 2])
cam(26.2, [960, 540], 1.6, 0.6)                     // icono
cam(26.9, [970, 540], 1.32, 0.65)                   // lockup (abs 540..1390)
cam(27.6, [970, 540], 1.42, 2.4, "inOutSine")       // push lento hasta el final

// ---------------------------------------------------------------------------
// SONIDO
// ---------------------------------------------------------------------------
const SND = (t, preset, o = {}) => sfx(preset, { at: t, volume: 0.55, ...o })
SND(0.25, "pop", { volume: 0.45 })
SND(0.76, "tick", { volume: 0.4 }); SND(1.26, "tick", { volume: 0.4, pitch: 2 }); SND(1.76, "tick", { volume: 0.4, pitch: 4 })
SND(2.5, "click")
SND(2.95, "swoosh", { volume: 0.35 })
for (let i = 0; i < Q1.length; i += 3) SND(3.3 + i * (1.45 / Q1.length), "key", { seed: i + 1, volume: 0.28, pitch: (i % 4) - 2 })
SND(5.0, "click", { pitch: 2 })
SND(5.45, "whoosh", { volume: 0.4 })
SND(7.65, "tick", { volume: 0.3 }); SND(8.75, "tick", { volume: 0.3, pitch: 2 }); SND(9.7, "success", { volume: 0.4 })
SND(11.5, "click"); SND(11.48, "swoosh", { volume: 0.3 })
for (let i = 0; i < 6; i++) SND(12.0 + i * 0.09, "pop", { volume: 0.22, pitch: i })
SND(14.5, "tap", { volume: 0.4 })
SND(16.5, "click"); SND(16.48, "swoosh", { volume: 0.3 })
for (let i = 0; i < 8; i += 2) SND(16.95 + i * 0.05, "key", { seed: 20 + i, volume: 0.28 })
SND(18.5, "click"); SND(18.62, "success", { volume: 0.45 })
for (let i = 0; i < 6; i++) SND(20.1 + i * 0.15, "tick", { volume: 0.22, pitch: i * 2 })
SND(21.0, "notify", { volume: 0.45 })
SND(22.0, "click"); SND(21.98, "swoosh", { volume: 0.3 })
SND(23.45, "whoosh", { volume: 0.35 })
for (let i = 0; i < 6; i++) SND(23.8 + i * 0.1, "pop", { volume: 0.25, pitch: i })
SND(25.0, "riser", { volume: 0.25 })
SND(26.15, "swoosh", { volume: 0.35 })
SND(26.9, "impact", { volume: 0.55 })

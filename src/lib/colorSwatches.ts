import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";

// Muestras de color en el editor: delante de cada #hex / rgb() / rgba() aparece un
// cuadradito con el color; al pulsarlo se abre un selector (saturación/brillo, tono,
// transparencia y hex) que reescribe el valor en vivo conservando su formato.

const COLOR_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])|\brgba?\(\s*\d{1,3}%?\s*[,\s]\s*\d{1,3}%?\s*[,\s]\s*\d{1,3}%?\s*(?:[,/]\s*(?:\d*\.?\d+%?)\s*)?\)/g;

type RGBA = { r: number; g: number; b: number; a: number };

function parseColor(text: string): RGBA | null {
  if (text[0] === "#") {
    let h = text.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const m = text.match(/\(([^)]*)\)/);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  const ch = (v: string) => (v.endsWith("%") ? (parseFloat(v) * 255) / 100 : parseFloat(v));
  const a = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  return { r: ch(parts[0]), g: ch(parts[1]), b: ch(parts[2]), a: Math.max(0, Math.min(1, a)) };
}

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");

/** Escribe el color con el mismo formato que el original. */
function formatLike(original: string, c: RGBA): string {
  const round = (v: number) => Math.round(Math.max(0, Math.min(255, v)));
  if (original[0] === "#") {
    let out = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${c.a < 1 ? hex2(c.a * 255) : ""}`;
    // Forma corta si el original la usaba y el color lo permite (#fff, #fff8).
    const pairs = out.slice(1).match(/../g)!;
    if ((original.length === 4 || original.length === 5) && pairs.every((p) => p[0] === p[1])) {
      out = "#" + pairs.map((p) => p[0]).join("");
    }
    return original.slice(1) === original.slice(1).toUpperCase() && /[A-F]/i.test(original) ? out.toUpperCase() : out;
  }
  const a = Math.round(c.a * 100) / 100;
  const modern = !original.includes(","); // rgb(1 2 3 / .5)
  if (modern) return `rgb(${round(c.r)} ${round(c.g)} ${round(c.b)}${a < 1 ? ` / ${a}` : ""})`;
  return a < 1 ? `rgba(${round(c.r)}, ${round(c.g)}, ${round(c.b)}, ${a})` : `${original.startsWith("rgba") ? "rgba" : "rgb"}(${round(c.r)}, ${round(c.g)}, ${round(c.b)}${original.startsWith("rgba") ? ", 1" : ""})`;
}

const cssOf = (c: RGBA) => `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${c.a})`;

function rgbToHsv({ r, g, b }: RGBA) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}
function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

const CHECKER =
  "repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 50% / 8px 8px";

// ───────────────────────── Selector ─────────────────────────

let openPicker: { close: () => void; external: () => void } | null = null;

function showPicker(view: EditorView, anchor: HTMLElement, from: number, original: string) {
  openPicker?.close();
  const start = parseColor(original);
  if (!start) return;
  let { h, s, v } = rgbToHsv(start);
  let a = start.a;
  let len = original.length;
  let current = original;

  const root = document.createElement("div");
  root.className = "cm-colorPicker";
  root.innerHTML = `
    <div class="cp-sv"><div class="cp-sv-knob"></div></div>
    <div class="cp-bar cp-hue"><div class="cp-bar-knob"></div></div>
    <div class="cp-bar cp-alpha"><div class="cp-alpha-fill"></div><div class="cp-bar-knob"></div></div>
    <div class="cp-row"><span class="cp-prev"><span></span></span><input class="cp-hex" spellcheck="false" /></div>`;
  document.body.appendChild(root);
  const sv = root.querySelector<HTMLElement>(".cp-sv")!;
  const svKnob = root.querySelector<HTMLElement>(".cp-sv-knob")!;
  const hue = root.querySelector<HTMLElement>(".cp-hue")!;
  const alpha = root.querySelector<HTMLElement>(".cp-alpha")!;
  const alphaFill = root.querySelector<HTMLElement>(".cp-alpha-fill")!;
  const prev = root.querySelector<HTMLElement>(".cp-prev span")!;
  const hexIn = root.querySelector<HTMLInputElement>(".cp-hex")!;

  // Posición: bajo la muestra, sin salirse de la ventana.
  const r = anchor.getBoundingClientRect();
  const W = 224;
  const H = 236;
  root.style.left = `${Math.max(8, Math.min(window.innerWidth - W - 8, r.left))}px`;
  // Debajo si cabe; si no, encima; si tampoco, lo más abajo posible sin salirse.
  const below = r.bottom + 6;
  const above = r.top - H - 6;
  root.style.top = `${below + H <= window.innerHeight - 8 ? below : above >= 8 ? above : Math.max(8, window.innerHeight - H - 8)}px`;

  const color = (): RGBA => ({ ...hsvToRgb(h, s, v), a });
  const paint = () => {
    const c = color();
    sv.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h} 100% 50%))`;
    svKnob.style.left = `${s * 100}%`;
    svKnob.style.top = `${(1 - v) * 100}%`;
    (hue.firstElementChild as HTMLElement).style.left = `${(h / 360) * 100}%`;
    (alpha.lastElementChild as HTMLElement).style.left = `${a * 100}%`;
    alphaFill.style.background = `linear-gradient(to right, transparent, rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}))`;
    prev.style.background = cssOf(c);
    if (document.activeElement !== hexIn) hexIn.value = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${a < 1 ? hex2(a * 255) : ""}`;
  };
  // Reescribe el valor en el documento (agrupado en un solo deshacer).
  const write = () => {
    const next = formatLike(original, color());
    if (next === current) return;
    view.dispatch({ changes: { from, to: from + len, insert: next }, userEvent: "input.color" });
    len = next.length;
    current = next;
  };

  const drag = (el: HTMLElement, onPos: (x: number, y: number) => void) => {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const b = el.getBoundingClientRect();
        onPos(Math.max(0, Math.min(1, (ev.clientX - b.left) / b.width)), Math.max(0, Math.min(1, (ev.clientY - b.top) / b.height)));
        paint();
        write();
      };
      move(e);
      const up = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
    });
  };
  drag(sv, (x, y) => {
    s = x;
    v = 1 - y;
  });
  drag(hue, (x) => {
    h = Math.min(359.9, x * 360);
  });
  drag(alpha, (x) => {
    a = Math.round(x * 100) / 100;
  });
  const applyHex = () => {
    const c = parseColor(hexIn.value.trim().startsWith("#") ? hexIn.value.trim() : `#${hexIn.value.trim()}`);
    if (!c || !/^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hexIn.value.trim())) return;
    ({ h, s, v } = rgbToHsv(c));
    a = c.a;
    paint();
    write();
  };
  hexIn.addEventListener("input", applyHex);
  hexIn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "Escape") close();
  });

  const onDown = (e: MouseEvent) => {
    if (!root.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
  setTimeout(() => {
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
  });
  function close() {
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    root.remove();
    if (openPicker?.close === close) openPicker = null;
    view.focus();
  }
  openPicker = { close, external: close };
  paint();
}

// ───────────────────────── Decoraciones ─────────────────────────

class SwatchWidget extends WidgetType {
  constructor(
    readonly color: string,
    readonly from: number,
  ) {
    super();
  }
  eq(o: SwatchWidget) {
    return o.color === this.color && o.from === this.from;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("span");
    wrap.className = "cm-colorSwatch";
    wrap.title = "Cambiar color";
    const inner = document.createElement("span");
    const c = parseColor(this.color);
    inner.style.background = c ? cssOf(c) : this.color;
    wrap.appendChild(inner);
    wrap.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showPicker(view, wrap, this.from, this.color);
    });
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

function build(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    COLOR_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = COLOR_RE.exec(text))) {
      const pos = from + m.index;
      if (!parseColor(m[0])) continue;
      b.add(pos, pos, Decoration.widget({ widget: new SwatchWidget(m[0], pos), side: -1 }));
    }
  }
  return b.finish();
}

const swatchPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      // Un cambio que no viene del selector (el usuario escribe) cierra el selector.
      if (u.docChanged && openPicker && u.transactions.some((tr) => tr.docChanged && !tr.isUserEvent("input.color"))) {
        openPicker.external();
      }
      if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

const swatchTheme = EditorView.baseTheme({
  ".cm-colorSwatch": {
    display: "inline-block",
    width: "0.8em",
    height: "0.8em",
    margin: "0 0.35em 0 0.05em",
    verticalAlign: "-0.05em",
    borderRadius: "3px",
    background: CHECKER,
    boxShadow: "0 0 0 1px rgba(255,255,255,.28)",
    cursor: "pointer",
    overflow: "hidden",
  },
  ".cm-colorSwatch > span": { display: "block", width: "100%", height: "100%" },
});

// El selector vive en <body> (fuera del editor): estilos globales una sola vez.
function injectPickerCss() {
  if (document.getElementById("cm-color-picker-css")) return;
  const st = document.createElement("style");
  st.id = "cm-color-picker-css";
  st.textContent = `
.cm-colorPicker{position:fixed;z-index:1000;width:224px;padding:10px;border-radius:12px;background:#1b1b1f;border:1px solid #2c2c33;box-shadow:0 16px 40px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:9px;font:12px 'Plus Jakarta Sans Variable',system-ui,sans-serif;color:#ddd}
.cm-colorPicker .cp-sv{position:relative;height:140px;border-radius:8px;cursor:crosshair;touch-action:none}
.cm-colorPicker .cp-sv-knob{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4),0 1px 3px rgba(0,0,0,.5);pointer-events:none}
.cm-colorPicker .cp-bar{position:relative;height:12px;border-radius:6px;cursor:pointer;touch-action:none}
.cm-colorPicker .cp-hue{background:linear-gradient(to right,#f00,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00)}
.cm-colorPicker .cp-alpha{background:${CHECKER}}
.cm-colorPicker .cp-alpha-fill{position:absolute;inset:0;border-radius:6px}
.cm-colorPicker .cp-bar-knob{position:absolute;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.35),0 1px 3px rgba(0,0,0,.5);pointer-events:none}
.cm-colorPicker .cp-row{display:flex;align-items:center;gap:8px}
.cm-colorPicker .cp-prev{width:26px;height:26px;border-radius:7px;overflow:hidden;background:${CHECKER};box-shadow:0 0 0 1px rgba(255,255,255,.15);flex:none}
.cm-colorPicker .cp-prev span{display:block;width:100%;height:100%}
.cm-colorPicker .cp-hex{flex:1;min-width:0;height:26px;padding:0 8px;border-radius:7px;border:1px solid #2c2c33;background:#121214;color:#eee;font:12px ui-monospace,Consolas,monospace;outline:none}
.cm-colorPicker .cp-hex:focus{border-color:#6366f1}`;
  document.head.appendChild(st);
}

export function colorSwatches(): Extension {
  if (typeof document !== "undefined") injectPickerCss();
  return [swatchPlugin, swatchTheme];
}

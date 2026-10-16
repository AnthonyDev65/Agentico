// Utilidades del proxy de la vista móvil (ver proxy_fetch en lib.rs). Cada app del teléfono
// se carga por un esquema propio («agproxy», «agsafari», «agapp0..7»); en Windows WebView2
// los sirve como http://<esquema>.localhost.

export const proxyBase = (slot: string) =>
  typeof window !== "undefined" && window.location.protocol.startsWith("http")
    ? `http://${slot}.localhost`
    : `${slot}://localhost`;

export const originOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === "http:" || x.protocol === "https:" ? x.origin : null;
  } catch {
    return null;
  }
};

export const pathOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search + x.hash;
  } catch {
    return "/";
  }
};

/**
 * Lo que escribe el usuario en una barra de direcciones → URL (o búsqueda en DuckDuckGo).
 * No Google: detecta el proxy como tráfico automatizado y pide un reCAPTCHA que además
 * rechaza el dominio localhost del proxy.
 */
export function toUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^(localhost|127\.\d+\.\d+\.\d+|\d+\.\d+\.\d+\.\d+)(:\d+)?(\/|$)/i.test(t)) return `http://${t}`;
  if (!/\s/.test(t) && /^[^/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(t)) return `https://${t}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(t)}`;
}

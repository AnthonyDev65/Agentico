// Hilos de chat: una conversación del panel (de «Nuevo» a «Nuevo») puede abarcar varias
// sesiones de claude, porque el modo Auto, cambiar de modo/modelo o Detener reinician el
// proceso (contexto nuevo → .jsonl nuevo). Aquí se recuerda a qué hilo pertenece cada
// sesión para que el historial las muestre como UNA conversación con varias partes.

export type SessionMeta = { id: string; file: string; modified: number; size: number; title: string };
export type Thread = {
  key: string;
  title: string;
  modified: number;
  size: number;
  /** Partes de la más antigua a la más reciente. */
  parts: SessionMeta[];
};

const KEY = "agentico.chatThreads.v1";
const MAX = 3000;

function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") ?? {};
  } catch {
    return {};
  }
}

export const newThreadId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function linkSession(threadId: string, sessionId: string) {
  const m = load();
  if (m[sessionId] === threadId) return;
  m[sessionId] = threadId;
  const keys = Object.keys(m);
  // Recorte simple para que el mapa no crezca sin límite.
  if (keys.length > MAX) for (const k of keys.slice(0, keys.length - MAX)) delete m[k];
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* no-op */
  }
}

export const threadOf = (sessionId: string): string | undefined => load()[sessionId];

// Sesiones antiguas sin hilo registrado: se agrupan las contiguas con el mismo título
// separadas por menos de 2 h (típico del modo Auto: «Siguiente tarea de …»).
const GAP = 2 * 3600_000;

export function groupSessions(sessions: SessionMeta[]): Thread[] {
  const map = load();
  const asc = [...sessions].sort((a, b) => a.modified - b.modified);
  const byKey = new Map<string, SessionMeta[]>();
  let run: { key: string; title: string; last: number } | null = null;
  for (const s of asc) {
    const t = map[s.id];
    let key: string;
    if (t) {
      key = `t:${t}`;
      run = null;
    } else if (run && run.title === s.title && s.modified - run.last < GAP) {
      key = run.key;
      run.last = s.modified;
    } else {
      key = `s:${s.id}`;
      run = { key, title: s.title, last: s.modified };
    }
    const list = byKey.get(key) ?? [];
    list.push(s);
    byKey.set(key, list);
  }
  const out: Thread[] = [];
  for (const [key, parts] of byKey) {
    out.push({
      key,
      title: parts[0].title,
      modified: parts[parts.length - 1].modified,
      size: parts.reduce((n, p) => n + p.size, 0),
      parts,
    });
  }
  return out.sort((a, b) => b.modified - a.modified);
}

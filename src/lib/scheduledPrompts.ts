import { useSyncExternalStore } from "react";

// Prompts programados del chat: se guardan por proyecto en localStorage y los dispara el
// ChatView del proyecto (la app tiene que estar abierta). Si claude está ocupado a la hora
// indicada, el prompt entra en la cola y se envía al terminar el turno. Si la app estaba
// cerrada (o el equipo suspendido) y la hora pasó hace más de MISSED_MS, NO se envía solo:
// queda marcado como «perdido» para que el usuario decida.

export type Repeat = "none" | "hourly" | "daily" | "weekdays";

export type Scheduled = {
  id: string;
  text: string;
  at: number; // próxima ejecución (ms)
  repeat: Repeat;
  fresh: boolean; // empezar con contexto nuevo
  missed?: boolean;
};

export const MISSED_MS = 10 * 60_000;

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: "Una vez",
  hourly: "Cada hora",
  daily: "Cada día",
  weekdays: "Lun–Vie",
};

const keyOf = (project: string) => `agentico.scheduled.${project}`;
const cache = new Map<string, Scheduled[]>();
const listeners = new Set<() => void>();
let version = 0;

export function getScheduled(project: string): Scheduled[] {
  let v = cache.get(project);
  if (!v) {
    try {
      v = JSON.parse(localStorage.getItem(keyOf(project)) || "[]") as Scheduled[];
    } catch {
      v = [];
    }
    cache.set(project, v);
  }
  return v;
}

function save(project: string, list: Scheduled[]) {
  const sorted = [...list].sort((a, b) => a.at - b.at);
  cache.set(project, sorted);
  try {
    localStorage.setItem(keyOf(project), JSON.stringify(sorted));
  } catch {
    /* no-op */
  }
  version++;
  listeners.forEach((l) => l());
}

export function addScheduled(project: string, s: Omit<Scheduled, "id">) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  save(project, [...getScheduled(project), { ...s, id }]);
}

export function removeScheduled(project: string, id: string) {
  save(project, getScheduled(project).filter((s) => s.id !== id));
}

export function patchScheduled(project: string, id: string, patch: Partial<Scheduled>) {
  save(project, getScheduled(project).map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

/** Siguiente hora válida estrictamente posterior a `now` (null si no se repite). */
export function nextRun(s: Scheduled, now = Date.now()): number | null {
  if (s.repeat === "none") return null;
  const step = s.repeat === "hourly" ? 3600_000 : 86_400_000;
  let t = s.at;
  if (t <= now) t += Math.ceil((now - t + 1) / step) * step;
  if (s.repeat === "weekdays") {
    const d = new Date(t);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    t = d.getTime();
  }
  return t;
}

export function useScheduled(project: string): Scheduled[] {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
  return getScheduled(project);
}

export function fmtWhen(at: number, now = Date.now()): string {
  const d = new Date(at);
  const hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const today = new Date(now);
  const tomorrow = new Date(now + 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const diff = at - now;
  const rel =
    diff > 0 && diff < 3600_000 ? ` (en ${Math.max(1, Math.round(diff / 60_000))} min)` : "";
  if (same(d, today)) return `hoy ${hm}${rel}`;
  if (same(d, tomorrow)) return `mañana ${hm}`;
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${hm}`;
}

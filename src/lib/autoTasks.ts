import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { parseTasks, type TaskLine } from "@/lib/tasks";
import { AGENTICO_BUILD } from "@/lib/agenticoPlan";

// Modo Auto del tablero .tasks: al terminar cada turno de claude lanza la siguiente
// tarea (con contexto nuevo, para no arrastrar historial) hasta acabarlas todas.
// Vive a nivel de módulo: sigue funcionando aunque el tablero no esté visible.
// Se detiene con Detener, error, 2 turnos sin avance o al terminar; con preguntas
// pendientes espera la respuesta del usuario.

type Entry = {
  on: boolean;
  msg: string | null;
  projectPath: string;
  relPath: string;
  lastDone: number;
  stalls: number;
};

const entries = new Map<string, Entry>(); // por ruta del .tasks
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

export function askClaude(
  sessionId: string,
  text: string,
  opts: { send?: boolean; mode?: string; fresh?: boolean; ifIdle?: boolean } = {},
) {
  window.dispatchEvent(new CustomEvent("agentico:chat-prompt", { detail: { sessionId, text, ...opts } }));
}

export const BUILD = { send: true, mode: AGENTICO_BUILD };

export const nextTaskPrompt = (relPath: string, started: boolean) =>
  started ? `Siguiente tarea de ${relPath}.` : `Empieza a construir el proyecto con el plan de ${relPath}: primera tarea.`;

function set(filePath: string, patch: Partial<Entry>) {
  const cur = entries.get(filePath);
  if (!cur) return;
  entries.set(filePath, { ...cur, ...patch });
  emit();
}

export function startAuto(filePath: string, projectPath: string, relPath: string, done: number, started: boolean) {
  entries.set(filePath, { on: true, msg: "Trabajando en las tareas…", projectPath, relPath, lastDone: done, stalls: 0 });
  emit();
  // Arranca ya si claude está libre (si está ocupado, sigue al terminar ese turno).
  askClaude(projectPath, nextTaskPrompt(relPath, started), { ...BUILD, ifIdle: true });
}

export function stopAuto(filePath: string, msg: string | null = null) {
  set(filePath, { on: false, msg });
}

export function clearAutoMsg(filePath: string) {
  set(filePath, { msg: null });
}

export function useAuto(filePath: string): { on: boolean; msg: string | null } {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
  const e = entries.get(filePath);
  return { on: !!e?.on, msg: e?.msg ?? null };
}

async function onTurnEnd(e: Event) {
  const d = (e as CustomEvent<{ sessionId: string; isError?: boolean; hasQuestions?: boolean; stopped?: boolean }>)
    .detail;
  for (const [filePath, en] of entries) {
    if (!en.on || en.projectPath !== d?.sessionId) continue;
    if (d.stopped) {
      stopAuto(filePath, "Auto detenido");
      continue;
    }
    if (d.isError) {
      stopAuto(filePath, "Auto detenido por un error");
      continue;
    }
    if (d.hasQuestions) {
      set(filePath, { msg: "Esperando tus respuestas para seguir…" });
      continue;
    }
    let text = "";
    try {
      text = await invoke<string>("fs_read", { path: filePath });
    } catch {
      stopAuto(filePath, "Auto detenido: no se pudo leer el archivo");
      continue;
    }
    const all = parseTasks(text).filter((l): l is TaskLine => l.kind === "task");
    const done = all.filter((t) => t.status === "done").length;
    if (all.length && done === all.length) {
      stopAuto(filePath, "¡Todas las tareas hechas!");
      continue;
    }
    const stalls = done > en.lastDone ? 0 : en.stalls + 1;
    if (stalls >= 2) {
      stopAuto(filePath, "Auto detenido: 2 turnos sin completar tareas");
      continue;
    }
    set(filePath, { lastDone: done, stalls, msg: `Trabajando… ${done}/${all.length} hechas` });
    setTimeout(() => {
      if (entries.get(filePath)?.on) askClaude(en.projectPath, nextTaskPrompt(en.relPath, true), { ...BUILD, fresh: true });
    }, 800);
  }
}

window.addEventListener("agentico:chat-turn-end", onTurnEnd);

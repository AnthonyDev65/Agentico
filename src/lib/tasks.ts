// Formato `.tasks` de Agentico: checklist Markdown compacta (pocos tokens para la IA).
//
//   # Título
//   ## Sección
//   - [ ] pendiente   - [/] en curso   - [x] hecha
//   - [ ] Tarea !alta #etiqueta @2026-10-20
//     - [ ] subtarea (2 espacios por nivel)
//     nota libre bajo la tarea (indentada)
//
// Lo que no se reconoce se conserva tal cual (round-trip).

export type TaskStatus = "todo" | "doing" | "done";
export type Priority = "" | "alta" | "media" | "baja";

export type TaskLine = {
  kind: "task";
  id: string;
  depth: number;
  status: TaskStatus;
  title: string;
  priority: Priority;
  tags: string[];
  due: string;
  notes: string[];
};

export type DocLine =
  | { kind: "title"; id: string; text: string }
  | { kind: "section"; id: string; text: string }
  | { kind: "raw"; id: string; text: string }
  | TaskLine;

export const FORMAT_HINT =
  "<!-- Agentico tasks · - [ ] pendiente · - [/] en curso · - [x] hecha · !alta !media !baja · #etiqueta · @AAAA-MM-DD · subtareas con 2 espacios -->";

let n = 0;
export const lineId = () => `t${Date.now().toString(36)}${(n++).toString(36)}`;

const STATUS_CHAR: Record<TaskStatus, string> = { todo: " ", doing: "/", done: "x" };
const TASK_RE = /^(\s*)[-*]\s+\[([ xX/~-])\]\s?(.*)$/;

function parseMeta(text: string) {
  let priority: Priority = "";
  let due = "";
  const tags: string[] = [];
  const title = text
    .replace(/(^|\s)!(alta|media|baja)\b/gi, (_m, sp, p) => {
      priority = p.toLowerCase() as Priority;
      return sp;
    })
    .replace(/(^|\s)@(\d{4}-\d{2}-\d{2})\b/g, (_m, sp, d) => {
      due = d;
      return sp;
    })
    .replace(/(^|\s)#([\p{L}\p{N}_\-/]+)/gu, (_m, sp, t) => {
      tags.push(t);
      return sp;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { title, priority, due, tags };
}

export function parseTasks(text: string): DocLine[] {
  const out: DocLine[] = [];
  let lastTask: TaskLine | null = null;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const t = TASK_RE.exec(line);
    if (t) {
      const c = t[2].toLowerCase();
      const status: TaskStatus = c === "x" ? "done" : c === "/" || c === "~" || c === "-" ? "doing" : "todo";
      const task: TaskLine = {
        kind: "task",
        id: lineId(),
        depth: Math.floor(t[1].replace(/\t/g, "  ").length / 2),
        status,
        notes: [],
        ...parseMeta(t[3]),
      };
      out.push(task);
      lastTask = task;
      continue;
    }
    // Nota indentada bajo una tarea
    if (lastTask && /^\s{2,}\S/.test(line)) {
      lastTask.notes.push(line.trim());
      continue;
    }
    lastTask = null;
    const h1 = /^#\s+(.*)$/.exec(line);
    if (h1) {
      out.push({ kind: "title", id: lineId(), text: h1[1].trim() });
      continue;
    }
    const h2 = /^#{2,3}\s+(.*)$/.exec(line);
    if (h2) {
      out.push({ kind: "section", id: lineId(), text: h2[1].trim() });
      continue;
    }
    out.push({ kind: "raw", id: lineId(), text: line });
  }
  // Quita la línea vacía final que deja el split
  while (out.length && out[out.length - 1].kind === "raw" && !(out[out.length - 1] as any).text.trim()) out.pop();
  return out;
}

export function taskText(t: TaskLine) {
  const meta = [
    t.priority ? `!${t.priority}` : "",
    ...t.tags.map((x) => `#${x}`),
    t.due ? `@${t.due}` : "",
  ].filter(Boolean);
  return [t.title, ...meta].filter(Boolean).join(" ");
}

export function serializeTasks(doc: DocLine[]): string {
  const lines: string[] = [];
  for (const l of doc) {
    if (l.kind === "title") lines.push(`# ${l.text}`);
    else if (l.kind === "section") lines.push(`## ${l.text}`);
    else if (l.kind === "raw") lines.push(l.text);
    else {
      const ind = "  ".repeat(l.depth);
      lines.push(`${ind}- [${STATUS_CHAR[l.status]}] ${taskText(l)}`);
      for (const note of l.notes) lines.push(`${ind}  ${note}`);
    }
  }
  return lines.join("\n") + "\n";
}

// Índice final (exclusivo) del bloque de una tarea: ella + sus subtareas.
export function blockEnd(doc: DocLine[], i: number) {
  const t = doc[i] as TaskLine;
  let j = i + 1;
  while (j < doc.length) {
    const x = doc[j];
    if (x.kind !== "task" || x.depth <= t.depth) break;
    j++;
  }
  return j;
}

export function newTask(title: string, depth = 0): TaskLine {
  return { kind: "task", id: lineId(), depth, status: "todo", notes: [], ...parseMeta(title) };
}

export function tasksTemplate(projectName: string) {
  return `# Tareas · ${projectName}
${FORMAT_HINT}

## Por hacer
- [ ] Primera tarea !media

## Hecho
`;
}

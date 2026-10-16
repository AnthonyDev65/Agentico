import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Cancel01Icon,
  Delete02Icon,
  Flag02Icon,
  Search01Icon,
  SparklesIcon,
  Tick02Icon,
  PlayIcon,
  ArrowRight01Icon,
  Calendar03Icon,
} from "@hugeicons/core-free-icons";
import {
  blockEnd,
  lineId,
  newTask,
  parseTasks,
  serializeTasks,
  type DocLine,
  type Priority,
  type TaskLine,
  type TaskStatus,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { BUILD, askClaude, clearAutoMsg, nextTaskPrompt, startAuto, stopAuto, useAuto } from "@/lib/autoTasks";

type Filter = "all" | "todo" | "doing" | "done";

const PRIO_NEXT: Record<Priority, Priority> = { "": "alta", alta: "media", media: "baja", baja: "" };
const PRIO_STYLE: Record<Exclude<Priority, "">, string> = {
  alta: "border-red-500/40 bg-red-500/10 text-red-300",
  media: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  baja: "border-sky-500/40 bg-sky-500/10 text-sky-300",
};



export default function TaskBoard({
  content,
  onChange,
  projectPath,
  relPath,
  filePath,
}: {
  content: string;
  onChange: (text: string) => void;
  projectPath: string;
  relPath: string;
  filePath: string;
}) {
  const [doc, setDoc] = useState<DocLine[]>(() => parseTasks(content));
  const lastEmitted = useRef(content);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);

  // Cambios externos (Claude edita el archivo, modo Texto…) → re-interpretar.
  useEffect(() => {
    if (content !== lastEmitted.current) {
      lastEmitted.current = content;
      setDoc(parseTasks(content));
    }
  }, [content]);

  const commit = (next: DocLine[]) => {
    const text = serializeTasks(next);
    lastEmitted.current = text;
    setDoc(next);
    onChange(text);
  };

  const patch = (id: string, p: Partial<TaskLine>) =>
    commit(doc.map((l) => (l.id === id && l.kind === "task" ? { ...l, ...p } : l)));

  const tasks = doc.filter((l): l is TaskLine => l.kind === "task");
  const done = tasks.filter((t) => t.status === "done").length;
  const doing = tasks.filter((t) => t.status === "doing").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const title = doc.find((l) => l.kind === "title") as { id: string; text: string } | undefined;

  const q = query.trim().toLowerCase();
  const visible = (t: TaskLine) =>
    (filter === "all" || t.status === filter) &&
    (!q || t.title.toLowerCase().includes(q) || t.tags.some((x) => x.toLowerCase().includes(q)));

  // Agrupa en secciones: [cabecera | null, índices de líneas]
  const groups = useMemo(() => {
    const gs: { section: DocLine | null; start: number; end: number }[] = [];
    let cur: { section: DocLine | null; start: number; end: number } = { section: null, start: 0, end: 0 };
    doc.forEach((l, i) => {
      if (l.kind === "section") {
        cur.end = i;
        gs.push(cur);
        cur = { section: l, start: i + 1, end: 0 };
      }
    });
    cur.end = doc.length;
    gs.push(cur);
    // El grupo inicial sin sección solo se muestra si tiene tareas o no hay secciones
    return gs.filter(
      (g) => g.section || gs.length === 1 || doc.slice(g.start, g.end).some((l) => l.kind === "task"),
    );
  }, [doc]);

  const toggle = (t: TaskLine) => patch(t.id, { status: t.status === "done" ? "todo" : "done" });
  const setStatus = (t: TaskLine, status: TaskStatus) => patch(t.id, { status });

  const remove = (i: number) => {
    const end = blockEnd(doc, i);
    commit([...doc.slice(0, i), ...doc.slice(end)]);
  };

  const addSub = (i: number) => {
    const t = doc[i] as TaskLine;
    const sub = newTask("", t.depth + 1);
    const end = blockEnd(doc, i);
    commit([...doc.slice(0, end), sub, ...doc.slice(end)]);
    setFocusId(sub.id);
  };

  // Inserta al final del grupo (antes de las líneas vacías finales del grupo).
  const addToGroup = (g: { start: number; end: number }, text: string) => {
    let at = g.end;
    while (at > g.start && doc[at - 1].kind === "raw" && !(doc[at - 1] as any).text.trim()) at--;
    commit([...doc.slice(0, at), newTask(text), ...doc.slice(at)]);
  };

  const addSection = () => {
    const sec: DocLine = { kind: "section", id: lineId(), text: "Nueva sección" };
    const blank: DocLine = { kind: "raw", id: lineId(), text: "" };
    commit([...doc, blank, sec]);
    setFocusId(sec.id);
  };

  const removeSection = (g: { section: DocLine | null; start: number; end: number }) => {
    if (!g.section) return;
    // Quita la cabecera; las tareas pasan a la sección anterior.
    commit(doc.filter((l) => l.id !== g.section!.id));
  };

  // Prompts cortos: el modo Agentico Build ya trae el ciclo de trabajo (ahorra tokens).
  const claudeTask = (t: TaskLine) => askClaude(projectPath, `Haz esta tarea de ${relPath}: "${t.title}"`, BUILD);

  const started = tasks.some((t) => t.status !== "todo");
  const allDone = tasks.length > 0 && done === tasks.length;
  const claudeNext = () =>
    askClaude(
      projectPath,
      nextTaskPrompt(relPath, started),
      BUILD,
    );

  // Modo Auto (lógica global en lib/autoTasks: sigue aunque el tablero no esté visible).
  const { on: auto, msg: autoMsg } = useAuto(filePath);
  const toggleAuto = (on: boolean) =>
    on ? startAuto(filePath, projectPath, relPath, done, started) : stopAuto(filePath, "Auto desactivado");

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#121212]">
      {/* Cabecera */}
      <div className="shrink-0 border-b border-zinc-800 px-5 pb-3 pt-4">
        <div className="flex items-center gap-3">
          {title ? (
            <InlineText
              value={title.text}
              onCommit={(text) => commit(doc.map((l) => (l.id === title.id ? { ...l, text } : l)))}
              className="min-w-0 flex-1 text-lg font-semibold text-zinc-100"
            />
          ) : (
            <div className="flex-1 text-lg font-semibold text-zinc-100">Tareas</div>
          )}
          <button
            type="button"
            onClick={claudeNext}
            disabled={allDone || tasks.length === 0}
            title={
              allDone
                ? "Todas las tareas están hechas"
                : "Claude implementa la siguiente tarea pendiente (modo Agentico Build)"
            }
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            <HugeiconsIcon icon={allDone ? Tick02Icon : started ? ArrowRight01Icon : PlayIcon} size={13} />
            {allDone ? "Todo hecho" : started ? "Siguiente tarea" : "Empezar"}
          </button>
          <label
            title="Al terminar una tarea, Claude empieza la siguiente (contexto nuevo por tarea) hasta acabar todas"
            className={cn(
              "flex shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
              auto ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 text-zinc-400 hover:text-zinc-200",
              (allDone || tasks.length === 0) && !auto && "pointer-events-none opacity-40",
            )}
          >
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => toggleAuto(e.target.checked)}
              className="accent-emerald-500"
            />
            Auto
          </label>
        </div>
        {autoMsg && (
          <div
            className={cn(
              "mt-2 flex items-center gap-1.5 text-[11px]",
              auto ? "text-emerald-400" : "text-zinc-500",
            )}
          >
            {auto && <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />}
            {autoMsg}
            {!auto && (
              <button type="button" onClick={() => clearAutoMsg(filePath)} className="ml-1 text-zinc-600 hover:text-zinc-300">
                ✕
              </button>
            )}
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">
            {done}/{tasks.length} hechas{doing ? ` · ${doing} en curso` : ""}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-zinc-800 text-[11px]">
            {(
              [
                ["all", "Todas"],
                ["todo", "Pendientes"],
                ["doing", "En curso"],
                ["done", "Hechas"],
              ] as [Filter, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn(
                  "px-2.5 py-1 transition-colors",
                  filter === k ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex min-w-40 flex-1 items-center gap-1.5 rounded-md border border-zinc-800 bg-[#0f0f11] px-2">
            <HugeiconsIcon icon={Search01Icon} size={12} className="text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar tarea o #etiqueta"
              className="h-7 flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
            />
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {groups.map((g, gi) => {
          const lines = doc.slice(g.start, g.end).map((l, k) => ({ l, i: g.start + k }));
          const groupTasks = lines.filter((x) => x.l.kind === "task") as { l: TaskLine; i: number }[];
          const gDone = groupTasks.filter((x) => x.l.status === "done").length;
          return (
            <div key={g.section?.id ?? `g${gi}`} className="mb-5">
              {g.section && (
                <div className="group mb-1.5 flex items-center gap-2 border-b border-zinc-800/70 pb-1">
                  <InlineText
                    value={(g.section as any).text}
                    autoFocus={focusId === g.section.id}
                    onCommit={(text) => commit(doc.map((l) => (l.id === g.section!.id ? { ...l, text } : l)))}
                    className="min-w-0 flex-1 text-[13px] font-semibold uppercase tracking-wide text-zinc-300"
                  />
                  <span className="text-[11px] tabular-nums text-zinc-500">
                    {gDone}/{groupTasks.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSection(g)}
                    title="Quitar sección (las tareas se conservan)"
                    className="hidden size-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 group-hover:flex"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={11} />
                  </button>
                </div>
              )}

              {lines.map(({ l, i }) => {
                if (l.kind === "raw") {
                  const t = l.text.trim();
                  if (!t || t.startsWith("<!--")) return null;
                  return (
                    <div key={l.id} className="py-0.5 text-xs text-zinc-500">
                      {t}
                    </div>
                  );
                }
                if (l.kind !== "task" || !visible(l)) return null;
                return (
                  <TaskRow
                    key={l.id}
                    t={l}
                    autoFocus={focusId === l.id}
                    onToggle={() => toggle(l)}
                    onStatus={(s) => setStatus(l, s)}
                    onPatch={(p) => patch(l.id, p)}
                    onDelete={() => remove(i)}
                    onAddSub={() => addSub(i)}
                    onClaude={() => claudeTask(l)}
                  />
                );
              })}

              <AddTask onAdd={(text) => addToGroup(g, text)} />
            </div>
          );
        })}
        <button
          type="button"
          onClick={addSection}
          className="flex items-center gap-1 rounded-md border border-dashed border-zinc-800 px-3 py-1.5 text-xs text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
        >
          <HugeiconsIcon icon={Add01Icon} size={12} /> Nueva sección
        </button>
      </div>
    </div>
  );
}

function TaskRow({
  t,
  autoFocus,
  onToggle,
  onStatus,
  onPatch,
  onDelete,
  onAddSub,
  onClaude,
}: {
  t: TaskLine;
  autoFocus: boolean;
  onToggle: () => void;
  onStatus: (s: TaskStatus) => void;
  onPatch: (p: Partial<TaskLine>) => void;
  onDelete: () => void;
  onAddSub: () => void;
  onClaude: () => void;
}) {
  const dateRef = useRef<HTMLInputElement>(null);
  const isDone = t.status === "done";
  return (
    <div
      className="group flex items-start gap-2 rounded-md py-1 pr-1 hover:bg-zinc-800/30"
      style={{ paddingLeft: 4 + t.depth * 22 }}
    >
      {/* Checkbox: clic = hecha/pendiente · clic derecho = en curso */}
      <button
        type="button"
        onClick={onToggle}
        onContextMenu={(e) => {
          e.preventDefault();
          onStatus(t.status === "doing" ? "todo" : "doing");
        }}
        title="Clic: hecha / pendiente · Clic derecho: en curso"
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
          isDone
            ? "border-emerald-500 bg-emerald-500 text-black"
            : t.status === "doing"
              ? "border-amber-400 bg-amber-400/20 text-amber-300"
              : "border-zinc-600 hover:border-zinc-400",
        )}
      >
        {isDone && <HugeiconsIcon icon={Tick02Icon} size={11} strokeWidth={3} />}
        {t.status === "doing" && <span className="size-1.5 rounded-full bg-amber-400" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <InlineText
            value={t.title}
            autoFocus={autoFocus}
            placeholder="Nueva tarea"
            parseTokens
            onCommit={(text, meta) =>
              onPatch({
                title: text,
                ...(meta?.priority ? { priority: meta.priority } : {}),
                ...(meta?.due ? { due: meta.due } : {}),
                ...(meta?.tags.length ? { tags: [...new Set([...t.tags, ...meta.tags])] } : {}),
              })
            }
            className={cn(
              "min-w-[6rem] flex-1 text-[13px]",
              isDone ? "text-zinc-500 line-through decoration-zinc-600" : "text-zinc-200",
            )}
          />
          {t.status === "doing" && (
            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] text-amber-300">
              en curso
            </span>
          )}
          {t.priority && (
            <button
              type="button"
              onClick={() => onPatch({ priority: PRIO_NEXT[t.priority] })}
              title="Cambiar prioridad"
              className={cn("flex items-center gap-1 rounded border px-1.5 text-[10px]", PRIO_STYLE[t.priority])}
            >
              <HugeiconsIcon icon={Flag02Icon} size={10} /> {t.priority}
            </button>
          )}
          {t.tags.map((tag) => (
            <span
              key={tag}
              className="group/tag flex items-center gap-0.5 rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 text-[10px] text-indigo-300"
            >
              #{tag}
              <button
                type="button"
                onClick={() => onPatch({ tags: t.tags.filter((x) => x !== tag) })}
                className="hidden group-hover/tag:inline"
                aria-label={`Quitar #${tag}`}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={9} />
              </button>
            </span>
          ))}
          <span className="relative">
            {t.due && (
              <button
                type="button"
                onClick={() => dateRef.current?.showPicker?.()}
                className={cn(
                  "rounded border px-1.5 text-[10px]",
                  !isDone && t.due < new Date().toISOString().slice(0, 10)
                    ? "border-red-500/40 text-red-300"
                    : "border-zinc-700 text-zinc-400",
                )}
              >
                {new Date(t.due + "T00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </button>
            )}
            <input
              ref={dateRef}
              type="date"
              value={t.due}
              onChange={(e) => onPatch({ due: e.target.value })}
              className="pointer-events-none absolute left-0 top-0 h-0 w-0 opacity-0"
              tabIndex={-1}
            />
          </span>
        </div>
        {t.notes.map((n, k) => (
          <div key={k} className="mt-0.5 text-[11px] text-zinc-500">
            {n}
          </div>
        ))}
      </div>

      {/* Acciones al pasar el ratón */}
      <div className="hidden shrink-0 items-center group-hover:flex group-focus-within:flex">
        {!t.priority && (
          <RowBtn icon={Flag02Icon} title="Prioridad" onClick={() => onPatch({ priority: "alta" })} />
        )}
        {!t.due && (
          <RowBtn
            icon={Calendar03Icon}
            title="Fecha límite"
            onClick={() => {
              onPatch({ due: new Date().toISOString().slice(0, 10) });
              setTimeout(() => dateRef.current?.showPicker?.(), 50);
            }}
          />
        )}
        {t.status !== "doing" && !isDone && (
          <RowBtn icon={PlayIcon} title="Marcar en curso" onClick={() => onStatus("doing")} />
        )}
        <RowBtn icon={Add01Icon} title="Añadir subtarea" onClick={onAddSub} />
        <RowBtn icon={SparklesIcon} title="Que Claude la haga ahora (modo Agentico Build)" onClick={onClaude} accent />
        <RowBtn icon={Delete02Icon} title="Eliminar (con subtareas)" onClick={onDelete} danger />
      </div>
    </div>
  );
}

function RowBtn({
  icon,
  title,
  onClick,
  danger,
  accent,
}: {
  icon: any;
  title: string;
  onClick: () => void;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "flex size-6 items-center justify-center rounded text-zinc-500 transition-colors",
        danger
          ? "hover:bg-red-500/10 hover:text-red-400"
          : accent
            ? "text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300"
            : "hover:bg-zinc-800 hover:text-zinc-200",
      )}
    >
      <HugeiconsIcon icon={icon} size={13} />
    </button>
  );
}

type Meta = { priority: Priority; due: string; tags: string[] };

// Texto editable en línea: confirma con Enter o al salir. Con `parseTokens`
// extrae !prioridad #etiquetas @fecha escritos dentro del texto.
function InlineText({
  value,
  onCommit,
  className,
  placeholder,
  autoFocus,
  parseTokens,
}: {
  value: string;
  onCommit: (text: string, meta?: Meta) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  parseTokens?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const done = () => {
    if (draft === value) return;
    if (parseTokens) {
      const t = newTask(draft);
      onCommit(t.title, { priority: t.priority, due: t.due, tags: t.tags });
    } else if (draft.trim()) onCommit(draft.trim());
    else setDraft(value);
  };
  return (
    <input
      value={draft}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          setTimeout(() => (e.target as HTMLInputElement).blur());
        }
      }}
      className={cn(
        "rounded bg-transparent px-1 outline-none transition-colors hover:bg-zinc-800/50 focus:bg-zinc-800/80",
        className,
      )}
    />
  );
}

function AddTask({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="mt-1 flex items-center gap-2 pl-1">
      <HugeiconsIcon icon={Add01Icon} size={13} className="shrink-0 text-zinc-600" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            onAdd(text.trim());
            setText("");
          }
        }}
        placeholder="Añadir tarea…  (!alta #etiqueta @2026-10-20)"
        className="h-7 flex-1 bg-transparent text-[13px] text-zinc-300 outline-none placeholder:text-zinc-600"
      />
    </div>
  );
}

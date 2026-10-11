import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon, ViewOffIcon, Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons";

type Line =
  | { kind: "pair"; id: number; exported: boolean; key: string; value: string; visible: boolean }
  | { kind: "comment"; id: number; text: string }
  | { kind: "blank"; id: number };

function parse(text: string, nextId: () => number): Line[] {
  return text.split(/\r?\n/).map((raw): Line => {
    const id = nextId();
    const t = raw.trim();
    if (t === "") return { kind: "blank", id };
    if (t.startsWith("#")) return { kind: "comment", id, text: raw };
    const m = raw.match(/^(\s*export\s+)?([^=]+?)\s*=\s*([\s\S]*)$/);
    if (!m) return { kind: "comment", id, text: raw };
    return { kind: "pair", id, exported: !!m[1], key: m[2], value: m[3] ?? "", visible: false };
  });
}

function serialize(lines: Line[]): string {
  return lines
    .map((l) =>
      l.kind === "blank"
        ? ""
        : l.kind === "comment"
          ? l.text
          : `${l.exported ? "export " : ""}${l.key}=${l.value}`,
    )
    .join("\n");
}

export default function EnvEditor({
  initialContent,
  onChange,
}: {
  initialContent: string;
  onChange: (content: string) => void;
}) {
  const idc = useRef(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    idc.current = 0;
    setLines(parse(initialContent, () => idc.current++));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (next: Line[]) => {
    setLines(next);
    onChange(serialize(next));
  };

  const setPair = (id: number, patch: Partial<Extract<Line, { kind: "pair" }>>) =>
    commit(lines.map((l) => (l.id === id && l.kind === "pair" ? { ...l, ...patch } : l)));
  const setComment = (id: number, text: string) =>
    commit(lines.map((l) => (l.id === id && l.kind === "comment" ? { ...l, text } : l)));
  const remove = (id: number) => commit(lines.filter((l) => l.id !== id));
  const add = () =>
    commit([
      ...lines,
      { kind: "pair", id: idc.current++, exported: false, key: "", value: "", visible: true },
    ]);

  const count = lines.filter((l) => l.kind === "pair").length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-3 text-xs text-zinc-400">
        <span className="font-medium text-zinc-200">{count} variables</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={showAll ? ViewOffIcon : ViewIcon} size={13} />
            {showAll ? "Ocultar todo" : "Mostrar todo"}
          </button>
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-1 rounded bg-indigo-600 px-2 py-0.5 text-white hover:bg-indigo-500"
          >
            <HugeiconsIcon icon={Add01Icon} size={13} /> Añadir
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-1.5">
          {lines.map((l) => {
            if (l.kind === "blank") return <div key={l.id} className="h-1.5" />;
            if (l.kind === "comment")
              return (
                <input
                  key={l.id}
                  value={l.text}
                  onChange={(e) => setComment(l.id, e.target.value)}
                  spellCheck={false}
                  className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 font-mono text-[12px] italic text-zinc-500 outline-none focus:border-zinc-700 focus:bg-[#1a1a1a]"
                />
              );
            const shown = showAll || l.visible;
            return (
              <div key={l.id} className="group flex items-center gap-1.5">
                <input
                  value={l.key}
                  onChange={(e) => setPair(l.id, { key: e.target.value })}
                  placeholder="CLAVE"
                  spellCheck={false}
                  className="w-2/5 rounded-md border border-zinc-800 bg-[#1a1a1a] px-2 py-1 font-mono text-[12px] text-sky-300 outline-none focus:border-indigo-500/60"
                />
                <span className="text-zinc-600">=</span>
                <div className="relative flex-1">
                  <input
                    type={shown ? "text" : "password"}
                    value={l.value}
                    onChange={(e) => setPair(l.id, { value: e.target.value })}
                    placeholder="valor"
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full rounded-md border border-zinc-800 bg-[#1a1a1a] px-2 py-1 pr-8 font-mono text-[12px] text-amber-200 outline-none focus:border-indigo-500/60"
                  />
                  <button
                    type="button"
                    onClick={() => setPair(l.id, { visible: !l.visible })}
                    title={shown ? "Ocultar" : "Mostrar"}
                    className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-zinc-500 hover:text-zinc-200"
                  >
                    <HugeiconsIcon icon={shown ? ViewOffIcon : ViewIcon} size={13} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => remove(l.id)}
                  title="Eliminar variable"
                  className="flex size-6 shrink-0 items-center justify-center rounded text-zinc-500 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                >
                  <HugeiconsIcon icon={Delete01Icon} size={13} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-[11px] text-zinc-600">Guarda con Ctrl + S.</div>
      </div>
    </div>
  );
}

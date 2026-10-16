import { useEffect, useRef, useState } from "react";
import MermaidView from "@/components/MermaidView";
import { dotBackground, useDiagramTheme } from "@/lib/diagramThemes";
import SequenceEditor from "./SequenceEditor";
import ClassEditor from "./ClassEditor";
import GraphEditor from "./GraphEditor";
import { diagramType } from "@/lib/diagramTemplates";
import { Unsupported } from "@/lib/uml/common";
import { SEQ_STARTER, generateSequence, parseSequence, type SeqModel } from "@/lib/uml/sequence";
import { CLASS_STARTER, generateClass, parseClass, type ClassModel } from "@/lib/uml/classDiagram";
import { FLOW_STARTER, STATE_STARTER, generateGraph, parseGraph, type GraphModel } from "@/lib/uml/graph";

// Editor UML sin código: formulario a la izquierda ⇄ código Mermaid ⇄ diagrama en vivo a la derecha.
// El archivo sigue siendo Mermaid (.mmd): cada cambio regenera el código y marca el archivo
// como modificado (Ctrl+S guarda). Lo que el editor no entiende se conserva tal cual.

type State =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "seq"; model: SeqModel }
  | { kind: "class"; model: ClassModel }
  | { kind: "graph"; model: GraphModel };

export const VISUAL_KINDS = [
  { key: "seq", label: "Secuencia", desc: "Mensajes entre actores y sistemas en el tiempo", starter: SEQ_STARTER },
  { key: "class", label: "Clases", desc: "Clases con atributos, métodos y relaciones", starter: CLASS_STARTER },
  { key: "flow", label: "Flujo", desc: "Pasos, decisiones y conexiones", starter: FLOW_STARTER },
  { key: "state", label: "Estados", desc: "Estados y transiciones entre ellos", starter: STATE_STARTER },
];

export function canEditVisually(code: string) {
  if (!code.trim()) return true;
  return ["secuencia", "clases", "flujo", "estados"].includes(diagramType(code));
}

function parseAny(code: string): State {
  if (!code.trim()) return { kind: "empty" };
  try {
    switch (diagramType(code)) {
      case "secuencia":
        return { kind: "seq", model: parseSequence(code) };
      case "clases":
        return { kind: "class", model: parseClass(code) };
      case "flujo":
        return { kind: "graph", model: parseGraph(code, "flow") };
      case "estados":
        return { kind: "graph", model: parseGraph(code, "state") };
      default:
        return {
          kind: "error",
          message: "El editor visual soporta diagramas de secuencia, clases, flujo y estados. Usa la vista Código para este tipo.",
        };
    }
  } catch (e) {
    return { kind: "error", message: e instanceof Unsupported ? e.message : `No se pudo interpretar: ${e}` };
  }
}

export default function UmlVisualEditor({
  code,
  filePath,
  onChange,
  onShowCode,
}: {
  code: string;
  filePath: string;
  onChange: (code: string) => void;
  onShowCode: () => void;
}) {
  const theme = useDiagramTheme();
  const [state, setState] = useState<State>(() => parseAny(code));
  const lastEmitted = useRef(code);

  // Cambios que no vienen de este editor (plantilla, edición en Código…) → re-interpretar.
  useEffect(() => {
    if (code !== lastEmitted.current) {
      lastEmitted.current = code;
      setState(parseAny(code));
    }
  }, [code]);

  const emit = (next: State, out: string) => {
    lastEmitted.current = out;
    setState(next);
    onChange(out);
  };

  if (state.kind === "empty") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6" style={dotBackground(theme)}>
        <div className="text-center">
          <div className="text-sm text-zinc-200">Crea un diagrama sin escribir código</div>
          <div className="mt-1 text-xs text-zinc-500">Elige el tipo; luego lo editas con formularios.</div>
        </div>
        <div className="grid w-full max-w-lg grid-cols-2 gap-2">
          {VISUAL_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => onChange(k.starter)}
              className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-[#141416] p-3 text-left transition-colors hover:border-indigo-500/60 hover:bg-zinc-800/60"
            >
              <span className="text-sm font-medium text-zinc-100">{k.label}</span>
              <span className="text-[11px] text-zinc-500">{k.desc}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" style={dotBackground(theme)}>
        <div className="max-w-md text-sm text-zinc-400">{state.message}</div>
        <button
          type="button"
          onClick={onShowCode}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Ver código
        </button>
      </div>
    );
  }

  const raw = state.kind === "class" || state.kind === "graph" ? state.model.raw : null;
  const setRaw = (lines: string[]) => {
    if (state.kind === "class") {
      const model = { ...state.model, raw: lines };
      emit({ kind: "class", model }, generateClass(model));
    } else if (state.kind === "graph") {
      const model = { ...state.model, raw: lines };
      emit({ kind: "graph", model }, generateGraph(model));
    }
  };

  return (
    <div className="@container flex h-full min-h-0 bg-[#0d0d10]">
      <div className="flex h-full min-h-0 w-full flex-col @min-[820px]:flex-row">
        {/* Formulario */}
        <div className="h-1/2 min-h-0 shrink-0 overflow-y-auto border-b border-zinc-800 bg-[#121212] p-3 @min-[820px]:h-full @min-[820px]:w-[440px] @min-[820px]:border-b-0 @min-[820px]:border-r">
          {state.kind === "seq" && (
            <SequenceEditor
              model={state.model}
              onChange={(model) => emit({ kind: "seq", model }, generateSequence(model))}
            />
          )}
          {state.kind === "class" && (
            <ClassEditor
              model={state.model}
              onChange={(model) => emit({ kind: "class", model }, generateClass(model))}
            />
          )}
          {state.kind === "graph" && (
            <GraphEditor
              model={state.model}
              onChange={(model) => emit({ kind: "graph", model }, generateGraph(model))}
            />
          )}
          {raw && raw.length > 0 && (
            <details className="mt-5">
              <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Avanzado · {raw.length} línea{raw.length > 1 ? "s" : ""} Mermaid sin editor visual
              </summary>
              <textarea
                value={raw.join("\n")}
                onChange={(e) => setRaw(e.target.value.split("\n"))}
                rows={Math.min(10, raw.length + 1)}
                className="mt-2 w-full rounded-md border border-zinc-800 bg-[#121212] p-2 font-mono text-[11px] text-zinc-400 outline-none focus:border-indigo-500"
              />
            </details>
          )}
        </div>
        {/* Diagrama en vivo */}
        <div className="min-h-0 min-w-0 flex-1">
          <MermaidView code={code} filePath={filePath} />
        </div>
      </div>
    </div>
  );
}

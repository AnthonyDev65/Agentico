import { Add01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { move, toId, uid } from "@/lib/uml/common";
import {
  DIRECTIONS,
  EDGE_STYLES,
  SHAPES,
  START,
  nextNodeId,
  type GEdge,
  type GNode,
  type GraphModel,
} from "@/lib/uml/graph";
import { AddBtn, CommitInput, Empty, RowActions, Section, Select, TextInput } from "./ui";

export default function GraphEditor({
  model,
  onChange,
}: {
  model: GraphModel;
  onChange: (m: GraphModel) => void;
}) {
  const isState = model.kind === "state";
  const nodes = model.nodes;
  const nodeOpts = nodes.map((n) => ({ value: n.id, label: n.label || n.id }));
  const endpointOpts = isState ? [{ value: START, label: "● Inicio / fin" }, ...nodeOpts] : nodeOpts;

  const patchNode = (u: string, p: Partial<GNode>) =>
    onChange({ ...model, nodes: nodes.map((n) => (n.uid === u ? { ...n, ...p } : n)) });
  const patchEdge = (u: string, p: Partial<GEdge>) =>
    onChange({ ...model, edges: model.edges.map((e) => (e.uid === u ? { ...e, ...p } : e)) });

  const addNode = () => {
    if (isState) {
      const label = `Estado ${nodes.length + 1}`;
      const id = toId(label, new Set(nodes.map((n) => n.id)), "S");
      onChange({ ...model, nodes: [...nodes, { uid: uid(), id, label, shape: "round" }] });
    } else {
      const id = nextNodeId(model);
      onChange({ ...model, nodes: [...nodes, { uid: uid(), id, label: `Paso ${id}`, shape: "rect" }] });
    }
  };

  // En estados el id se deriva del nombre (y se actualizan las transiciones).
  const renameState = (n: GNode, label: string) => {
    const id = toId(label, new Set(nodes.filter((x) => x.uid !== n.uid).map((x) => x.id)), "S");
    const fix = (x: string) => (x === n.id ? id : x);
    onChange({
      ...model,
      nodes: nodes.map((x) => (x.uid === n.uid ? { ...x, id, label } : x)),
      edges: model.edges.map((e) => ({ ...e, from: fix(e.from), to: fix(e.to) })),
    });
  };

  const removeNode = (n: GNode) =>
    onChange({
      ...model,
      nodes: nodes.filter((x) => x.uid !== n.uid),
      edges: model.edges.filter((e) => e.from !== n.id && e.to !== n.id),
    });

  const addEdge = () => {
    const from = isState && !model.edges.length ? START : (nodes[0]?.id ?? START);
    const to = isState && !model.edges.length ? (nodes[0]?.id ?? START) : (nodes[1]?.id ?? nodes[0]?.id ?? START);
    onChange({ ...model, edges: [...model.edges, { uid: uid(), from, to, style: "-->", label: "" }] });
  };

  return (
    <div className="flex flex-col gap-5">
      <Section
        title={isState ? "Estados" : "Pasos / nodos"}
        right={
          <>
            <Select
              value={model.direction || (isState ? "TB" : "TD")}
              onChange={(d) => onChange({ ...model, direction: isState && d === "TB" ? "" : d })}
              options={
                isState
                  ? [{ value: "TB", label: "↓ Vertical" }, ...DIRECTIONS.filter((d) => d.value !== "TD")]
                  : DIRECTIONS
              }
              className="w-40"
              title="Dirección del diagrama"
            />
            <AddBtn icon={Add01Icon} label={isState ? "Estado" : "Nodo"} onClick={addNode} />
          </>
        }
      >
        {nodes.length === 0 && <Empty>Añade {isState ? "estados" : "pasos"} para empezar.</Empty>}
        {nodes.map((n, i) => (
          <div key={n.uid} className="group flex items-center gap-1.5">
            {!isState && (
              <Select
                value={n.shape}
                onChange={(shape) => patchNode(n.uid, { shape })}
                options={SHAPES}
                className="w-40"
                title="Forma"
              />
            )}
            {isState ? (
              <CommitInput value={n.label} onCommit={(l) => renameState(n, l)} className="flex-1" />
            ) : (
              <TextInput
                value={n.label}
                onChange={(label) => patchNode(n.uid, { label })}
                placeholder="Texto"
                className="flex-1"
              />
            )}
            <span className="w-8 shrink-0 truncate text-center font-mono text-[10px] text-zinc-600" title="Id interno">
              {n.id}
            </span>
            <RowActions
              index={i}
              count={nodes.length}
              onMove={(to) => onChange({ ...model, nodes: move(nodes, i, to) })}
              onDelete={() => removeNode(n)}
            />
          </div>
        ))}
      </Section>

      <Section
        title={isState ? "Transiciones" : "Conexiones"}
        right={<AddBtn icon={ArrowRight01Icon} label={isState ? "Transición" : "Conexión"} onClick={addEdge} />}
      >
        {model.edges.length === 0 && (
          <Empty>
            {isState
              ? "Conecta los estados. Usa «● Inicio / fin» para el estado inicial y final."
              : "Conecta los pasos entre sí."}
          </Empty>
        )}
        {model.edges.map((e, i) => (
          <div key={e.uid} className="group flex flex-wrap items-center gap-1">
            <Select value={e.from} onChange={(from) => patchEdge(e.uid, { from })} options={endpointOpts} className="w-[30%]" />
            {isState ? (
              <span className="px-1 text-zinc-500">→</span>
            ) : (
              <Select
                value={e.style}
                onChange={(style) => patchEdge(e.uid, { style })}
                options={EDGE_STYLES}
                className="w-28"
              />
            )}
            <Select value={e.to} onChange={(to) => patchEdge(e.uid, { to })} options={endpointOpts} className="w-[30%]" />
            <TextInput
              value={e.label}
              onChange={(label) => patchEdge(e.uid, { label })}
              placeholder={isState ? "evento" : "etiqueta"}
              className="min-w-24 flex-1"
            />
            <RowActions
              index={i}
              count={model.edges.length}
              onMove={(to) => onChange({ ...model, edges: move(model.edges, i, to) })}
              onDelete={() => onChange({ ...model, edges: model.edges.filter((x) => x.uid !== e.uid) })}
            />
          </div>
        ))}
      </Section>
    </div>
  );
}

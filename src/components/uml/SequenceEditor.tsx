import { useState } from "react";
import { Add01Icon, Layers01Icon, Note01Icon, UserIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { uid, move } from "@/lib/uml/common";
import {
  SEQ_ARROWS,
  SEQ_BLOCKS,
  newParticipantId,
  renameParticipant,
  stepDepths,
  type SeqBlockType,
  type SeqModel,
  type SeqStep,
} from "@/lib/uml/sequence";
import { AddBtn, CommitInput, Empty, RowActions, Section, Select, TextInput } from "./ui";
import { cn } from "@/lib/utils";

const SEP_LABEL = { else: "Sino", and: "Y en paralelo", option: "Opción" } as const;

export default function SequenceEditor({
  model,
  onChange,
}: {
  model: SeqModel;
  onChange: (m: SeqModel) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [blockType, setBlockType] = useState<SeqBlockType>("alt");
  const parts = model.participants;
  const partOpts = parts.map((p) => ({ value: p.id, label: p.label }));
  const depths = stepDepths(model.steps);

  const setSteps = (steps: SeqStep[]) => onChange({ ...model, steps });
  const patchStep = (u: string, patch: Partial<SeqStep>) =>
    setSteps(model.steps.map((s) => (s.uid === u ? ({ ...s, ...patch } as SeqStep) : s)));

  // Inserta tras el paso seleccionado (o al final).
  const insert = (items: SeqStep[]) => {
    const i = model.steps.findIndex((s) => s.uid === selected);
    const at = i < 0 ? model.steps.length : i + 1;
    const steps = [...model.steps];
    steps.splice(at, 0, ...items);
    setSteps(steps);
    setSelected(items[0].uid);
  };

  const addParticipant = (kind: "participant" | "actor") => {
    const label = kind === "actor" ? `Actor ${parts.length + 1}` : `Participante ${parts.length + 1}`;
    onChange({
      ...model,
      participants: [...parts, { id: newParticipantId(label, model), label, kind }],
    });
  };

  const removeParticipant = (id: string) =>
    onChange({
      ...model,
      participants: parts.filter((p) => p.id !== id),
      steps: model.steps.filter(
        (s) => !(s.t === "msg" && (s.from === id || s.to === id)) && !(s.t === "note" && (s.a === id || s.b === id)),
      ),
    });

  // Borrar un bloque quita su cabecera, sus separadores y su `end` (el contenido se queda).
  const removeStep = (index: number) => {
    const s = model.steps[index];
    if (s.t !== "block") return setSteps(model.steps.filter((_, i) => i !== index));
    const drop = new Set([index]);
    let d = 0;
    for (let i = index + 1; i < model.steps.length; i++) {
      const x = model.steps[i];
      if (x.t === "block") d++;
      else if (x.t === "end") {
        if (d === 0) {
          drop.add(i);
          break;
        }
        d--;
      } else if (x.t === "sep" && d === 0) drop.add(i);
    }
    setSteps(model.steps.filter((_, i) => !drop.has(i)));
  };

  const a = parts[0]?.id ?? "";
  const b = parts[1]?.id ?? a;

  return (
    <div className="flex flex-col gap-5">
      <Section
        title="Participantes"
        right={
          <>
            <AddBtn icon={UserIcon} label="Actor" onClick={() => addParticipant("actor")} />
            <AddBtn icon={Add01Icon} label="Participante" onClick={() => addParticipant("participant")} />
          </>
        }
      >
        {parts.length === 0 ? (
          <Empty>Añade los actores y sistemas que intervienen.</Empty>
        ) : (
          <div className="flex flex-col gap-1">
            {parts.map((p, i) => (
              <div key={p.id} className="group flex items-center gap-1.5">
                <Select
                  value={p.kind}
                  onChange={(kind) =>
                    onChange({ ...model, participants: parts.map((x) => (x.id === p.id ? { ...x, kind } : x)) })
                  }
                  options={[
                    { value: "actor", label: "👤 Actor" },
                    { value: "participant", label: "▭ Sistema" },
                  ]}
                  className="w-28"
                />
                <CommitInput
                  value={p.label}
                  onCommit={(label) => {
                    const id = newParticipantId(label, model, p.id);
                    const renamed = id === p.id ? model : renameParticipant(model, p.id, id);
                    onChange({
                      ...renamed,
                      participants: renamed.participants.map((x) => (x.id === id ? { ...x, label } : x)),
                    });
                  }}
                  className="flex-1"
                />
                <RowActions
                  index={i}
                  count={parts.length}
                  onMove={(to) => onChange({ ...model, participants: move(parts, i, to) })}
                  onDelete={() => removeParticipant(p.id)}
                />
              </div>
            ))}
          </div>
        )}
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400">
          <input
            type="checkbox"
            checked={model.autonumber}
            onChange={(e) => onChange({ ...model, autonumber: e.target.checked })}
            className="accent-indigo-500"
          />
          Numerar los mensajes
        </label>
      </Section>

      <Section
        title="Pasos"
        right={
          <>
            <AddBtn
              icon={ArrowRight01Icon}
              label="Mensaje"
              onClick={() => insert([{ uid: uid(), t: "msg", from: a, to: b, arrow: "->>", text: "Mensaje", act: "" }])}
            />
            <AddBtn
              icon={Note01Icon}
              label="Nota"
              onClick={() => insert([{ uid: uid(), t: "note", pos: "right of", a, b: "", text: "Nota" }])}
            />
          </>
        }
      >
        <div className="flex items-center gap-1">
          <Select value={blockType} onChange={setBlockType} options={SEQ_BLOCKS} className="flex-1" />
          <AddBtn
            icon={Layers01Icon}
            label="Bloque"
            onClick={() => {
              const def = SEQ_BLOCKS.find((x) => x.value === blockType)!;
              const items: SeqStep[] = [{ uid: uid(), t: "block", type: blockType, label: blockType === "rect" ? "rgba(99,102,241,0.15)" : "condición" }];
              if (def.sep) items.push({ uid: uid(), t: "sep", type: def.sep, label: "otro caso" });
              items.push({ uid: uid(), t: "end" });
              insert(items);
            }}
          />
        </div>
        {parts.length < 1 && <Empty>Primero añade participantes.</Empty>}
        {model.steps.length === 0 && parts.length > 0 && (
          <Empty>Añade mensajes. Lo nuevo se inserta debajo del paso seleccionado.</Empty>
        )}
        <div className="flex flex-col gap-1">
          {model.steps.map((s, i) => (
            <div
              key={s.uid}
              onMouseDown={() => setSelected(s.uid)}
              style={{ marginLeft: depths[i] * 14 }}
              className={cn(
                "group flex items-start gap-1.5 rounded-md border p-1.5",
                selected === s.uid ? "border-indigo-500/50 bg-indigo-500/5" : "border-transparent hover:bg-zinc-800/30",
                (s.t === "block" || s.t === "sep" || s.t === "end") && "border-l-2 border-l-amber-500/50",
              )}
            >
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                {s.t === "msg" && (
                  <>
                    <Select value={s.from} onChange={(from) => patchStep(s.uid, { from })} options={partOpts} className="w-[30%]" />
                    <Select
                      value={s.arrow}
                      onChange={(arrow) => patchStep(s.uid, { arrow })}
                      options={SEQ_ARROWS}
                      className="w-[34%]"
                      title="Tipo de mensaje"
                    />
                    <Select value={s.to} onChange={(to) => patchStep(s.uid, { to })} options={partOpts} className="w-[30%]" />
                    <TextInput value={s.text} onChange={(text) => patchStep(s.uid, { text })} placeholder="Texto del mensaje" className="flex-1" />
                    <Select
                      value={s.act}
                      onChange={(act) => patchStep(s.uid, { act })}
                      options={[
                        { value: "", label: "—" },
                        { value: "+", label: "▶ activa" },
                        { value: "-", label: "■ desactiva" },
                      ]}
                      className="w-24"
                      title="Barra de activación del destino"
                    />
                  </>
                )}
                {s.t === "note" && (
                  <>
                    <span className="px-1 text-[11px] text-sky-400">Nota</span>
                    <Select
                      value={s.pos}
                      onChange={(pos) => patchStep(s.uid, { pos })}
                      options={[
                        { value: "right of", label: "a la derecha de" },
                        { value: "left of", label: "a la izquierda de" },
                        { value: "over", label: "sobre" },
                      ]}
                      className="w-36"
                    />
                    <Select value={s.a} onChange={(v) => patchStep(s.uid, { a: v })} options={partOpts} className="w-28" />
                    {s.pos === "over" && (
                      <Select
                        value={s.b}
                        onChange={(v) => patchStep(s.uid, { b: v })}
                        options={[{ value: "", label: "(solo uno)" }, ...partOpts]}
                        className="w-28"
                      />
                    )}
                    <TextInput value={s.text} onChange={(text) => patchStep(s.uid, { text })} placeholder="Texto" className="w-full" />
                  </>
                )}
                {s.t === "block" && (
                  <>
                    <Select
                      value={s.type}
                      onChange={(type) => patchStep(s.uid, { type })}
                      options={SEQ_BLOCKS}
                      className="w-40"
                    />
                    <TextInput
                      value={s.label}
                      onChange={(label) => patchStep(s.uid, { label })}
                      placeholder={s.type === "rect" ? "color, p.ej. rgba(…)" : "condición / descripción"}
                      className="flex-1"
                    />
                  </>
                )}
                {s.t === "sep" && (
                  <>
                    <span className="px-1 text-[11px] text-amber-400">{SEP_LABEL[s.type]}</span>
                    <TextInput value={s.label} onChange={(label) => patchStep(s.uid, { label })} placeholder="descripción" className="flex-1" />
                  </>
                )}
                {s.t === "end" && <span className="px-1 py-1 text-[11px] text-zinc-600">fin del bloque</span>}
                {s.t === "raw" && (
                  <TextInput
                    value={s.text}
                    onChange={(text) => patchStep(s.uid, { text })}
                    mono
                    className="w-full text-zinc-400"
                    title="Línea Mermaid que el editor visual no interpreta (se conserva tal cual)"
                  />
                )}
              </div>
              <RowActions
                index={i}
                count={model.steps.length}
                onMove={(to) => setSteps(move(model.steps, i, to))}
                onDelete={s.t === "end" ? undefined : () => removeStep(i)}
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

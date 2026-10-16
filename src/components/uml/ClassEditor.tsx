import { Add01Icon, ArrowRight01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { move, uid } from "@/lib/uml/common";
import {
  ANNOTATIONS,
  REL_ARROWS,
  VISIBILITIES,
  newClassName,
  renameClass,
  type ClassMember,
  type ClassModel,
  type UmlClass,
} from "@/lib/uml/classDiagram";
import { AddBtn, CommitInput, Empty, IconBtn, RowActions, Section, Select, TextInput } from "./ui";
import { DIRECTIONS } from "@/lib/uml/graph";

const newMember = (kind: "attr" | "method"): ClassMember => ({
  uid: uid(),
  vis: kind === "method" ? "+" : "-",
  kind,
  name: kind === "method" ? "metodo" : "atributo",
  type: kind === "method" ? "void" : "String",
  params: "",
  classifier: "",
});

export default function ClassEditor({
  model,
  onChange,
}: {
  model: ClassModel;
  onChange: (m: ClassModel) => void;
}) {
  const classes = model.classes;
  const classOpts = classes.map((c) => ({ value: c.name, label: c.name }));

  const patchClass = (u: string, patch: Partial<UmlClass>) =>
    onChange({ ...model, classes: classes.map((c) => (c.uid === u ? { ...c, ...patch } : c)) });

  const patchMember = (c: UmlClass, mu: string, patch: Partial<ClassMember>) =>
    patchClass(c.uid, { members: c.members.map((m) => (m.uid === mu ? { ...m, ...patch } : m)) });

  const addClass = () => {
    const name = newClassName(`Clase ${classes.length + 1}`, model);
    onChange({ ...model, classes: [...classes, { uid: uid(), name, annotation: "", members: [] }] });
  };

  const removeClass = (c: UmlClass) =>
    onChange({
      ...model,
      classes: classes.filter((x) => x.uid !== c.uid),
      relations: model.relations.filter((r) => r.from !== c.name && r.to !== c.name),
    });

  const addRelation = () => {
    const a = classes[0]?.name ?? "";
    const b = classes[1]?.name ?? a;
    onChange({
      ...model,
      relations: [...model.relations, { uid: uid(), from: a, to: b, arrow: "-->", fromCard: "", toCard: "", label: "" }],
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Section
        title="Clases"
        right={
          <>
            <Select
              value={model.direction || "TB"}
              onChange={(d) => onChange({ ...model, direction: d === "TB" ? "" : d })}
              options={[{ value: "TB", label: "↓ Vertical" }, ...DIRECTIONS.filter((d) => d.value !== "TD")]}
              className="w-36"
              title="Dirección del diagrama"
            />
            <AddBtn icon={Add01Icon} label="Clase" onClick={addClass} />
          </>
        }
      >
        {classes.length === 0 && <Empty>Añade una clase para empezar.</Empty>}
        {classes.map((c, ci) => (
          <div key={c.uid} className="flex flex-col gap-1.5 rounded-lg border border-zinc-800 bg-[#141416] p-2">
            <div className="group flex items-center gap-1.5">
              <CommitInput
                value={c.name}
                onCommit={(label) => {
                  const name = newClassName(label, model, c.name);
                  onChange(renameClass(model, c.name, name));
                }}
                className="flex-1 font-semibold"
              />
              <Select
                value={c.annotation}
                onChange={(annotation) => patchClass(c.uid, { annotation })}
                options={ANNOTATIONS.map((a) => ({ value: a, label: a ? `«${a}»` : "clase normal" }))}
                className="w-32"
              />
              <RowActions
                index={ci}
                count={classes.length}
                onMove={(to) => onChange({ ...model, classes: move(classes, ci, to) })}
                onDelete={() => removeClass(c)}
              />
            </div>
            <div className="flex flex-col gap-1 border-t border-zinc-800/80 pt-1.5">
              {c.members.map((m, mi) => (
                <div key={m.uid} className="group flex items-center gap-1">
                  <Select
                    value={m.vis}
                    onChange={(vis) => patchMember(c, m.uid, { vis })}
                    options={VISIBILITIES.map((v) => ({ ...v, label: v.label.split(" ")[0] }))}
                    className="w-11 px-1 text-center font-mono"
                    title="Visibilidad: + público, − privado, # protegido, ~ paquete"
                  />
                  <TextInput
                    value={m.name}
                    onChange={(name) => patchMember(c, m.uid, { name: name.replace(/\s/g, "") })}
                    placeholder={m.kind === "method" ? "método" : "atributo"}
                    mono
                    className="w-[28%]"
                  />
                  {m.kind === "method" && (
                    <TextInput
                      value={m.params}
                      onChange={(params) => patchMember(c, m.uid, { params })}
                      placeholder="(parámetros)"
                      mono
                      className="w-[26%]"
                    />
                  )}
                  <TextInput
                    value={m.type}
                    onChange={(type) => patchMember(c, m.uid, { type })}
                    placeholder={m.kind === "method" ? "retorno" : "tipo"}
                    mono
                    className="flex-1 text-sky-300"
                  />
                  <Select
                    value={m.classifier}
                    onChange={(classifier) => patchMember(c, m.uid, { classifier })}
                    options={[
                      { value: "", label: "·" },
                      { value: "$", label: "static" },
                      { value: "*", label: "abstract" },
                    ]}
                    className="w-16 px-1"
                    title="Estático / abstracto"
                  />
                  <RowActions
                    index={mi}
                    count={c.members.length}
                    onMove={(to) => patchClass(c.uid, { members: move(c.members, mi, to) })}
                    onDelete={() => patchClass(c.uid, { members: c.members.filter((x) => x.uid !== m.uid) })}
                  />
                </div>
              ))}
              <div className="flex gap-1">
                <AddBtn
                  icon={Add01Icon}
                  label="Atributo"
                  onClick={() => patchClass(c.uid, { members: [...c.members, newMember("attr")] })}
                />
                <AddBtn
                  icon={Add01Icon}
                  label="Método"
                  onClick={() => patchClass(c.uid, { members: [...c.members, newMember("method")] })}
                />
              </div>
            </div>
          </div>
        ))}
      </Section>

      <Section title="Relaciones" right={<AddBtn icon={ArrowRight01Icon} label="Relación" onClick={addRelation} />}>
        {model.relations.length === 0 && (
          <Empty>{classes.length < 2 ? "Crea al menos dos clases para relacionarlas." : "Sin relaciones todavía."}</Empty>
        )}
        {model.relations.map((r) => {
          const def = REL_ARROWS.find((x) => x.value === r.arrow) ?? REL_ARROWS[0];
          const patch = (p: Partial<typeof r>) =>
            onChange({ ...model, relations: model.relations.map((x) => (x.uid === r.uid ? { ...x, ...p } : x)) });
          return (
            <div key={r.uid} className="group flex flex-col gap-1 rounded-md border border-zinc-800/80 p-1.5">
              <div className="flex items-center gap-1">
                <Select value={r.from} onChange={(from) => patch({ from })} options={classOpts} className="w-[30%]" />
                <Select value={r.arrow} onChange={(arrow) => patch({ arrow })} options={REL_ARROWS} className="flex-1" />
                <Select value={r.to} onChange={(to) => patch({ to })} options={classOpts} className="w-[30%]" />
                <IconBtn
                  icon={Delete02Icon}
                  title="Eliminar relación"
                  danger
                  onClick={() => onChange({ ...model, relations: model.relations.filter((x) => x.uid !== r.uid) })}
                />
              </div>
              <div className="flex items-center gap-1">
                <TextInput value={r.fromCard} onChange={(fromCard) => patch({ fromCard })} placeholder="1" className="w-14 text-center" title="Cardinalidad origen" />
                <TextInput value={r.label} onChange={(label) => patch({ label })} placeholder="etiqueta (opcional)" className="flex-1" />
                <TextInput value={r.toCard} onChange={(toCard) => patch({ toCard })} placeholder="*" className="w-14 text-center" title="Cardinalidad destino" />
                <span className="w-6" />
              </div>
              <div className="px-1 text-[10px] text-zinc-500">{def.describe(r.from, r.to)}</div>
            </div>
          );
        })}
      </Section>
    </div>
  );
}

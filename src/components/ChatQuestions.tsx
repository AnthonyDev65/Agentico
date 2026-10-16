import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon, Loading03Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

// Preguntas seleccionables en el chat. Claude las emite como bloque:
//   ```questions
//   [{"q":"¿Pregunta?","options":["A — detalle","B"],"multi":false}]
//   ```
// y aquí se dibujan como tarjetas; al enviar se manda la respuesta como mensaje.

export type Question = { q: string; options: string[]; multi?: boolean };

export type Segment =
  | { kind: "md"; text: string }
  | { kind: "questions"; questions: Question[] | null; raw: string; complete: boolean };

const OPEN = /```questions[^\n]*\n/g;

// Divide el texto del asistente en Markdown normal y bloques de preguntas.
export function splitQuestions(text: string): Segment[] {
  const out: Segment[] = [];
  let pos = 0;
  OPEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN.exec(text))) {
    if (m.index > pos) out.push({ kind: "md", text: text.slice(pos, m.index) });
    const bodyStart = m.index + m[0].length;
    const close = text.indexOf("```", bodyStart);
    const complete = close >= 0;
    const raw = text.slice(bodyStart, complete ? close : text.length);
    out.push({ kind: "questions", questions: complete ? parseQuestions(raw) : null, raw, complete });
    pos = complete ? close + 3 : text.length;
    OPEN.lastIndex = pos;
  }
  if (pos < text.length) out.push({ kind: "md", text: text.slice(pos) });
  return out;
}

function parseQuestions(raw: string): Question[] | null {
  try {
    const data = JSON.parse(raw);
    const arr = Array.isArray(data) ? data : data?.questions;
    if (!Array.isArray(arr)) return null;
    const qs = arr
      .map((x: any) => ({
        q: String(x.q ?? x.question ?? "").trim(),
        options: (Array.isArray(x.options) ? x.options : []).map((o: any) =>
          typeof o === "string" ? o : String(o?.label ?? o),
        ),
        multi: !!(x.multi ?? x.multiSelect),
      }))
      .filter((x: Question) => x.q);
    return qs.length ? qs : null;
  } catch {
    return null;
  }
}

// "Etiqueta — detalle" → [etiqueta, detalle]
function splitOption(o: string): [string, string] {
  const i = o.search(/\s[—–-]\s/);
  return i > 0 ? [o.slice(0, i).trim(), o.slice(i + 3).trim()] : [o, ""];
}

type Answer = { picked: string[]; other: string };

export function QuestionsCard({
  questions,
  locked,
  onSubmit,
}: {
  questions: Question[];
  locked: boolean;
  onSubmit: (text: string) => void;
}) {
  const [answers, setAnswers] = useState<Answer[]>(() => questions.map(() => ({ picked: [], other: "" })));
  const [sent, setSent] = useState(false);
  const disabled = locked || sent;

  const set = (i: number, a: Partial<Answer>) =>
    setAnswers((prev) => prev.map((x, k) => (k === i ? { ...x, ...a } : x)));

  const toggle = (i: number, opt: string) => {
    const q = questions[i];
    const cur = answers[i];
    if (q.multi) {
      set(i, { picked: cur.picked.includes(opt) ? cur.picked.filter((x) => x !== opt) : [...cur.picked, opt] });
    } else {
      set(i, { picked: cur.picked[0] === opt ? [] : [opt], other: "" });
    }
  };

  const valueOf = (a: Answer) =>
    [...a.picked.map((p) => splitOption(p)[0]), a.other.trim()].filter(Boolean).join(", ");
  const answered = answers.filter((a) => valueOf(a)).length;

  const submit = () => {
    const lines = questions
      .map((q, i) => {
        const v = valueOf(answers[i]);
        return v ? `${i + 1}. ${q.q}\n   → ${v}` : null;
      })
      .filter(Boolean);
    if (!lines.length) return;
    setSent(true);
    onSubmit(`Mis respuestas:\n${lines.join("\n")}`);
  };

  return (
    <div className="my-2 flex flex-col gap-3 rounded-xl border border-indigo-500/25 bg-[#15151c] p-3">
      {questions.map((q, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex items-start gap-2 text-[13px] font-medium text-zinc-100">
            <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] text-indigo-300">
              {i + 1}
            </span>
            <span>
              {q.q}
              {q.multi && <span className="ml-1.5 text-[10px] font-normal text-zinc-500">(varias)</span>}
            </span>
          </div>
          <div className="flex flex-col gap-1 pl-7">
            {q.options.map((o) => {
              const [label, detail] = splitOption(o);
              const on = answers[i].picked.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(i, o)}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                    on
                      ? "border-indigo-500/70 bg-indigo-500/15 text-zinc-100"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-300 enabled:hover:border-zinc-600 enabled:hover:bg-zinc-800/60",
                    disabled && !on && "opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-3.5 shrink-0 items-center justify-center border",
                      q.multi ? "rounded" : "rounded-full",
                      on ? "border-indigo-400 bg-indigo-500 text-white" : "border-zinc-600",
                    )}
                  >
                    {on && <HugeiconsIcon icon={Tick02Icon} size={9} strokeWidth={3} />}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-medium">{label}</span>
                    {detail && <span className="text-[11px] text-zinc-500">{detail}</span>}
                  </span>
                </button>
              );
            })}
            <input
              value={answers[i].other}
              disabled={disabled}
              onChange={(e) =>
                set(i, { other: e.target.value, ...(q.multi || !e.target.value ? {} : { picked: [] }) })
              }
              onKeyDown={(e) => e.key === "Enter" && !disabled && submit()}
              placeholder="Otra respuesta…"
              className="h-7 rounded-lg border border-zinc-800 bg-transparent px-2.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-indigo-500/60 disabled:opacity-50"
            />
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-zinc-800 pt-2.5">
        <span className="text-[11px] text-zinc-500">
          {sent || locked ? "Respuestas enviadas" : `${answered}/${questions.length} respondidas`}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={submit}
            disabled={answered === 0}
            className="flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            Enviar respuestas <HugeiconsIcon icon={ArrowRight01Icon} size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

export function QuestionsPending() {
  return (
    <div className="my-2 flex items-center gap-2 rounded-xl border border-indigo-500/25 bg-[#15151c] px-3 py-2.5 text-xs text-zinc-400">
      <HugeiconsIcon icon={Loading03Icon} size={13} className="animate-spin text-indigo-400" />
      Preparando preguntas…
    </div>
  );
}

// Instrucción que se añade al system prompt de claude (todas las sesiones del chat).
export const QUESTIONS_PROMPT = `# Preguntas con opciones (interfaz de Agentico)
Cuando necesites que el usuario elija entre opciones (aclaraciones, decisiones), NO las escribas como lista: emite UN bloque de código con lenguaje \`questions\` que contenga JSON:
\`\`\`questions
[{"q":"¿Pregunta corta?","options":["Opción A — detalle breve","Opción B"],"multi":false}]
\`\`\`
Máximo 5 preguntas y 2-5 opciones por pregunta; "multi": true si puede elegir varias. La interfaz muestra botones y siempre deja escribir otra respuesta, así que no añadas una opción "Otro". Escribe una frase de contexto antes del bloque, nada después, y espera la respuesta.`;

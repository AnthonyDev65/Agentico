import { useEffect, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShieldKeyIcon, Tick02Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

// Tarjeta de aprobación cuando claude pide usar una herramienta que requiere permiso
// (comandos de terminal, escritura fuera del proyecto, MCP…).

export type PermissionDecision = "allow" | "always" | "deny" | "auto";

function summary(toolName: string, input: any): { label: string; code?: string } {
  if (!input || typeof input !== "object") return { label: toolName };
  if (typeof input.command === "string") return { label: "Ejecutar comando", code: input.command };
  if (typeof input.file_path === "string") return { label: `${toolName}`, code: input.file_path };
  if (typeof input.url === "string") return { label: `${toolName}`, code: input.url };
  if (typeof input.path === "string") return { label: `${toolName}`, code: input.path };
  return { label: toolName, code: JSON.stringify(input, null, 2).slice(0, 600) };
}

export default function PermissionCard({
  toolName,
  input,
  description,
  reason,
  canAlways,
  status,
  onDecide,
}: {
  toolName: string;
  input: any;
  description?: string;
  reason?: string;
  canAlways: boolean;
  status: "pending" | "allowed" | "always" | "denied" | "cancelled" | "auto";
  onDecide: (d: PermissionDecision) => void;
}) {
  const { label, code } = summary(toolName, input);
  const pending = status === "pending";
  const allowRef = useRef<HTMLButtonElement>(null);
  // Foco en «Permitir»: Enter aprueba rápido sin ir al ratón.
  useEffect(() => {
    if (pending) allowRef.current?.focus({ preventScroll: true });
  }, [pending]);

  return (
    <div
      className={cn(
        "max-w-[88%] self-start overflow-hidden rounded-xl border text-xs",
        pending ? "border-amber-500/40 bg-amber-500/[0.06]" : "border-zinc-800 bg-zinc-900/60",
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <HugeiconsIcon icon={ShieldKeyIcon} size={14} className={pending ? "text-amber-400" : "text-zinc-500"} />
        <span className="font-medium text-zinc-200">
          {pending ? "Claude pide permiso" : "Permiso"} · {label}
        </span>
        <span className="ml-auto text-[10px] text-zinc-500">{toolName}</span>
      </div>
      {description && <div className="px-3 pt-1 text-zinc-400">{description}</div>}
      {code && (
        <pre className="mx-3 mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/40 p-2 font-mono text-[11px] text-zinc-200">
          {code}
        </pre>
      )}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        {pending ? (
          <>
            <button
              ref={allowRef}
              type="button"
              onClick={() => onDecide("allow")}
              className="rounded-md bg-emerald-600 px-3 py-1 font-medium text-white outline-none hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-400/60"
            >
              Permitir
            </button>
            {canAlways && (
              <button
                type="button"
                onClick={() => onDecide("always")}
                title="Guarda la regla en la configuración local del proyecto (.claude/settings.local.json) y no vuelve a preguntar por este comando"
                className="rounded-md border border-emerald-500/40 px-3 py-1 text-emerald-300 hover:bg-emerald-500/10"
              >
                Siempre en este proyecto
              </button>
            )}
            <button
              type="button"
              onClick={() => onDecide("auto")}
              title="Aprueba este y todos los permisos siguientes sin preguntar (se desactiva con el botón «Auto-permitir» del chat)"
              className="rounded-md border border-amber-500/40 px-3 py-1 text-amber-200 hover:bg-amber-500/10"
            >
              Permitir todo siempre
            </button>
            <button
              type="button"
              onClick={() => onDecide("deny")}
              className="rounded-md px-3 py-1 text-zinc-400 hover:bg-red-500/10 hover:text-red-300"
            >
              Denegar
            </button>
            {reason && reason !== description && <span className="text-[10px] text-zinc-500">{reason}</span>}
          </>
        ) : (
          <span
            className={cn(
              "flex items-center gap-1",
              status === "denied" || status === "cancelled" ? "text-zinc-500" : "text-emerald-400",
            )}
          >
            <HugeiconsIcon icon={status === "denied" || status === "cancelled" ? Cancel01Icon : Tick02Icon} size={12} />
            {status === "auto"
              ? "Permitido automáticamente"
              : status === "allowed"
              ? "Permitido"
              : status === "always"
                ? "Permitido siempre en este proyecto"
                : status === "denied"
                  ? "Denegado"
                  : "Cancelado"}
          </span>
        )}
      </div>
    </div>
  );
}

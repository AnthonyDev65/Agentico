import { cn } from "@/lib/utils";

// Diff coloreado (+ verde, - rojo, @@ cian, cabeceras grises).
export function DiffView({ diff, path }: { diff: string; path: string }) {
  if (!diff.trim()) {
    return (
      <div className="p-4 text-sm text-zinc-500">
        Archivo nuevo sin seguimiento (o sin cambios que mostrar).
        <div className="mt-1 text-xs text-zinc-600">{path}</div>
      </div>
    );
  }
  return (
    <pre className="min-w-full p-3 font-mono text-[12px] leading-[1.5]">
      {diff.split("\n").map((ln, i) => {
        const cls =
          ln.startsWith("+") && !ln.startsWith("+++")
            ? "text-emerald-400 bg-emerald-500/5"
            : ln.startsWith("-") && !ln.startsWith("---")
              ? "text-red-400 bg-red-500/5"
              : ln.startsWith("@@")
                ? "text-cyan-400"
                : ln.startsWith("diff ") ||
                    ln.startsWith("index ") ||
                    ln.startsWith("+++") ||
                    ln.startsWith("---")
                  ? "text-zinc-500"
                  : "text-zinc-300";
        return (
          <div key={i} className={cn("whitespace-pre-wrap break-all px-1", cls)}>
            {ln || " "}
          </div>
        );
      })}
    </pre>
  );
}

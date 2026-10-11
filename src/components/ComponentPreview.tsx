import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon, Refresh01Icon, Alert02Icon } from "@hugeicons/core-free-icons";
import { bundleComponent } from "@/lib/componentBundler";

export default function ComponentPreview({
  projectPath,
  filePath,
  content,
}: {
  projectPath: string;
  filePath: string;
  content: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const id = setTimeout(() => {
      bundleComponent({ projectPath, filePath, content })
        .then((r) => {
          if (cancel) return;
          if (r.error) setError(r.error);
          else {
            setHtml(r.html!);
            setError(null);
          }
        })
        .catch((e) => !cancel && setError(String(e)))
        .finally(() => !cancel && setLoading(false));
    }, 600);
    return () => {
      cancel = true;
      clearTimeout(id);
    };
  }, [projectPath, filePath, content, tick]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0d0d10]">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-3 text-[11px] text-zinc-500">
        {loading ? (
          <span className="flex items-center gap-1.5">
            <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" /> compilando…
          </span>
        ) : (
          <span>vista previa del componente</span>
        )}
        <button
          type="button"
          onClick={() => setTick((t) => t + 1)}
          title="Recompilar"
          className="ml-auto flex size-5 items-center justify-center rounded hover:bg-zinc-800 hover:text-zinc-200"
        >
          <HugeiconsIcon icon={Refresh01Icon} size={12} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {error ? (
          <div className="flex h-full flex-col gap-2 overflow-auto p-4">
            <div className="flex items-center gap-2 text-xs text-red-400">
              <HugeiconsIcon icon={Alert02Icon} size={14} /> No se pudo compilar el componente
            </div>
            <pre className="whitespace-pre-wrap break-words text-[11px] text-zinc-400">{error}</pre>
            <div className="text-[10px] text-zinc-600">
              Nota: el preview omite CSS/assets y resuelve paquetes npm vía esm.sh (requiere
              internet). Componentes con hooks de contexto, rutas o alias no estándar pueden fallar.
            </div>
          </div>
        ) : html ? (
          <iframe
            title="preview"
            sandbox="allow-scripts allow-same-origin"
            srcDoc={html}
            className="h-full w-full border-0 bg-white"
          />
        ) : null}
      </div>
    </div>
  );
}

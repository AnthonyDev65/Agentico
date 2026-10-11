import { useEffect, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  fontFamily: "Inter, system-ui, sans-serif",
});

let counter = 0;

export default function MermaidView({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!code.trim()) {
        setSvg("");
        setError(null);
        return;
      }
      try {
        const { svg } = await mermaid.render(`mmd-${++counter}`, code);
        if (!cancelled) {
          setSvg(svg);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code]);

  return (
    <div className="h-full min-h-0 overflow-auto bg-[#0d0d10] p-6">
      {error ? (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-red-400">Error en el diagrama</div>
          <pre className="whitespace-pre-wrap break-words text-[11px] text-zinc-400">{error}</pre>
        </div>
      ) : (
        <div
          className="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  );
}

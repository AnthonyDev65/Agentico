import { createElement, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

export default function ModelView({ path }: { path: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let ok = true;
    // Carga perezosa: model-viewer incluye three.js (pesado).
    import("@google/model-viewer")
      .then(() => ok && setReady(true))
      .catch(() => ok && setReady(true));
    return () => {
      ok = false;
    };
  }, []);

  if (!ready)
    return (
      <div className="flex h-full items-center justify-center bg-[#0d0d10] text-xs text-zinc-500">
        cargando visor 3D…
      </div>
    );

  const src = convertFileSrc(path);
  return (
    <div className="h-full w-full bg-[#0d0d10]">
      {createElement("model-viewer", {
        src,
        "camera-controls": "",
        "auto-rotate": "",
        "shadow-intensity": "1",
        exposure: "1.1",
        "environment-image": "neutral",
        style: { width: "100%", height: "100%", backgroundColor: "#0d0d10" },
      } as Record<string, unknown>)}
    </div>
  );
}

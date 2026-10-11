import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import ModelView from "@/components/ModelView";
import type { MediaKind } from "@/lib/fileIcons";

export default function MediaView({
  path,
  name,
  kind,
}: {
  path: string;
  name: string;
  kind: MediaKind;
}) {
  const src = convertFileSrc(path);

  if (kind === "audio")
    return (
      <div className="flex h-full items-center justify-center bg-[#0d0d10] p-6">
        <audio controls src={src} className="w-full max-w-lg" />
      </div>
    );

  if (kind === "video")
    return (
      <div className="flex h-full items-center justify-center bg-black p-4">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video controls src={src} className="max-h-full max-w-full" />
      </div>
    );

  if (kind === "pdf")
    return <iframe title={name} src={src} className="h-full w-full border-0 bg-white" />;

  if (kind === "model") return <ModelView path={path} />;

  return <FontPreview src={src} name={name} />;
}

function FontPreview({ src, name }: { src: string; name: string }) {
  const [family, setFamily] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const fam = "pf-" + name.replace(/[^a-zA-Z0-9]/g, "");
    let ff: FontFace | null = null;
    (async () => {
      try {
        ff = new FontFace(fam, `url("${src}")`);
        await ff.load();
        document.fonts.add(ff);
        setFamily(fam);
      } catch (e) {
        setErr(String(e));
      }
    })();
    return () => {
      if (ff) {
        try {
          document.fonts.delete(ff);
        } catch {
          /* no-op */
        }
      }
    };
  }, [src, name]);

  if (err)
    return (
      <div className="p-4 text-sm text-red-300">No se pudo cargar la fuente: {err}</div>
    );
  if (!family)
    return <div className="p-4 text-sm text-zinc-500">cargando fuente…</div>;

  const sizes = [56, 40, 28, 20, 16];
  return (
    <div className="h-full overflow-auto bg-[#121212] p-6 text-zinc-100" style={{ fontFamily: family }}>
      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-wider text-zinc-600" style={{ fontFamily: "Inter" }}>
          {name}
        </div>
        <div className="text-6xl">Aa Bb Cc Dd</div>
      </div>
      <div className="mb-6 break-words text-xl text-zinc-300">
        ABCDEFGHIJKLMNOPQRSTUVWXYZ
        <br />
        abcdefghijklmnopqrstuvwxyz
        <br />
        0123456789 !?@#$%&*()[]{"{}"}
      </div>
      <div className="flex flex-col gap-3 border-t border-zinc-800 pt-4">
        {sizes.map((s) => (
          <div key={s} className="flex items-baseline gap-3">
            <span className="w-10 shrink-0 text-[10px] text-zinc-600" style={{ fontFamily: "Inter" }}>
              {s}px
            </span>
            <span style={{ fontSize: s }}>The quick brown fox jumps over the lazy dog</span>
          </div>
        ))}
      </div>
    </div>
  );
}

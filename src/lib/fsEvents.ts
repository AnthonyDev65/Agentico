import { listen } from "@tauri-apps/api/event";

// Cambios en disco de un proyecto (watcher de Rust `fs_watch_start`), agrupados ~300 ms.
export type FsChange = { root: string; dirs: string[]; files: string[]; structural: boolean };

// Comparación de rutas tolerante a "\" vs "/" y mayúsculas (Windows).
export const normPath = (p: string) => p.replace(/[\\/]+/g, "/").replace(/\/$/, "").toLowerCase();

export function onFsChange(root: string, cb: (c: FsChange) => void): () => void {
  const r = normPath(root);
  let unlisten: (() => void) | null = null;
  let disposed = false;
  listen<FsChange>("fs://change", (e) => {
    if (normPath(e.payload.root) === r) cb(e.payload);
  }).then((u) => {
    if (disposed) u();
    else unlisten = u;
  });
  return () => {
    disposed = true;
    unlisten?.();
  };
}

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Estado del control remoto (servidor para el teléfono + túnel), compartido por el panel,
// el ChatView (publica instantáneas solo si está activo) y App (lista de proyectos).

export type RemoteStatus = {
  running: boolean;
  port: number;
  lan: boolean;
  token: string;
  lan_ip: string | null;
  tunnel_running: boolean;
  tunnel_url: string | null;
  cloudflared: string | null;
};

const AUTOSTART_KEY = "agentico.remote.autostart"; // "server" | "tunnel" | ausente

let status: RemoteStatus | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function refreshRemote(): Promise<RemoteStatus | null> {
  try {
    status = await invoke<RemoteStatus>("remote_status");
  } catch {
    status = null;
  }
  emit();
  return status;
}

export function setRemoteStatus(s: RemoteStatus) {
  status = s;
  emit();
}

export const remoteRunning = () => !!status?.running;

export function useRemote(): RemoteStatus | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
  );
}

export function setAutostart(v: "server" | "tunnel" | null) {
  try {
    if (v) localStorage.setItem(AUTOSTART_KEY, v);
    else localStorage.removeItem(AUTOSTART_KEY);
  } catch {
    /* no-op */
  }
}

/** Al abrir Agentico: vuelve a encender lo que estaba encendido al cerrarlo. */
export async function initRemote() {
  listen("remote://status", () => void refreshRemote());
  await refreshRemote();
  const auto = localStorage.getItem(AUTOSTART_KEY);
  if (!auto || status?.running) return;
  try {
    setRemoteStatus(await invoke<RemoteStatus>("remote_start", {}));
    if (auto === "tunnel" && status?.cloudflared) setRemoteStatus(await invoke<RemoteStatus>("remote_tunnel_start"));
  } catch {
    /* puerto ocupado, etc.: el panel mostrará el estado */
  }
}

/** Enlace con el token para abrir desde el teléfono. */
export function remoteLink(s: RemoteStatus, base: "tunnel" | "lan" | "local"): string | null {
  const host =
    base === "tunnel"
      ? s.tunnel_url
      : base === "lan"
        ? s.lan && s.lan_ip
          ? `http://${s.lan_ip}:${s.port}`
          : null
        : `http://127.0.0.1:${s.port}`;
  return host ? `${host}/?t=${s.token}` : null;
}

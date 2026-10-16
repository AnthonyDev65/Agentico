import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { renderSVG } from "uqr";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SmartPhone01Icon,
  Copy01Icon,
  Tick02Icon,
  Loading03Icon,
  Alert02Icon,
  Refresh01Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import SideDrawer from "@/components/SideDrawer";
import { refreshRemote, remoteLink, setAutostart, setRemoteStatus, useRemote, type RemoteStatus } from "@/lib/remote";
import { cn } from "@/lib/utils";

// Panel «Control remoto»: enciende el servidor del chat para el teléfono, el túnel de
// Cloudflare (acceso desde cualquier red) y muestra el QR con el enlace + token.
export default function RemotePanel({ onClose }: { onClose: () => void }) {
  const st = useRemote();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [port, setPort] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [autostart, setAuto] = useState(() => !!localStorage.getItem("agentico.remote.autostart"));

  useEffect(() => {
    void refreshRemote();
  }, []);
  useEffect(() => {
    if (st && !port) setPort(String(st.port));
  }, [st, port]);

  const run = async (key: string, fn: () => Promise<RemoteStatus | string>) => {
    setBusy(key);
    setError(null);
    try {
      const r = await fn();
      if (typeof r === "object") setRemoteStatus(r);
      else await refreshRemote();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const syncAutostart = (on: boolean, tunnel: boolean) => {
    setAuto(on);
    setAutostart(on ? (tunnel ? "tunnel" : "server") : null);
  };

  const start = () =>
    run("server", () => invoke<RemoteStatus>("remote_start", { port: Number(port) || undefined, lan: st?.lan ?? false }));
  const stop = () => run("server", () => invoke<RemoteStatus>("remote_stop"));
  const setLan = (lan: boolean) =>
    run("server", () => invoke<RemoteStatus>("remote_start", { port: st?.port, lan }));
  const tunnelOn = () =>
    run("tunnel", async () => {
      const s = await invoke<RemoteStatus>("remote_tunnel_start");
      if (autostart) setAutostart("tunnel");
      return s;
    });
  const tunnelOff = () =>
    run("tunnel", async () => {
      const s = await invoke<RemoteStatus>("remote_tunnel_stop");
      if (autostart) setAutostart("server");
      return s;
    });
  const install = () => run("install", () => invoke<string>("remote_install_cloudflared"));
  const regen = () =>
    run("regen", async () => {
      setConfirmRegen(false);
      return invoke<RemoteStatus>("remote_regen_token");
    });

  const source: "tunnel" | "lan" | "local" | null = !st?.running
    ? null
    : st.tunnel_url
      ? "tunnel"
      : st.lan && st.lan_ip
        ? "lan"
        : "local";
  const link = st && source ? remoteLink(st, source) : null;
  const qr = useMemo(
    () => (link ? renderSVG(link, { border: 2, whiteColor: "#ffffff", blackColor: "#121212" }) : null),
    [link],
  );

  const copy = async () => {
    if (!link) return;
    await invoke("clipboard_write", { text: link }).catch(() => navigator.clipboard?.writeText(link));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <SideDrawer title="Control remoto" icon={SmartPhone01Icon} iconClass="text-emerald-400" width={520} onClose={onClose}>
      <div className="flex flex-col gap-5 text-[13px] text-zinc-300">
        <p className="text-[12px] leading-relaxed text-zinc-400">
          Sigue y controla el chat de Claude desde el navegador de tu teléfono, aunque estés en otra red: ves las
          respuestas en vivo, envías mensajes (o los pones en cola), apruebas permisos y respondes preguntas.
          Agentico tiene que seguir abierto en este PC.
        </p>

        {error && (
          <div className="flex items-start gap-2 whitespace-pre-wrap rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-[12px] text-red-300">
            <HugeiconsIcon icon={Alert02Icon} size={14} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* 1. Servidor */}
        <Section n={1} title="Servidor del chat" on={!!st?.running}>
          <div className="flex items-center gap-2">
            <label className="text-[12px] text-zinc-500">Puerto</label>
            <input
              value={port}
              disabled={!!st?.running}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
              className="w-20 rounded-md border border-zinc-800 bg-[#121212] px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-zinc-700 disabled:opacity-50"
            />
            <div className="ml-auto">
              {st?.running ? (
                <Btn onClick={stop} busy={busy === "server"} variant="ghost">
                  Desactivar
                </Btn>
              ) : (
                <Btn onClick={start} busy={busy === "server"}>
                  Activar
                </Btn>
              )}
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-[12px] text-zinc-400">
            <input
              type="checkbox"
              checked={!!st?.lan}
              disabled={!st?.running || busy != null}
              onChange={(e) => setLan(e.target.checked)}
              className="mt-0.5 accent-emerald-500"
            />
            <span>
              Aceptar conexiones de la red local / Tailscale
              <span className="block text-[11px] text-zinc-600">
                Si no, solo escucha en este PC y se accede a través del túnel.
                {st?.lan && st.lan_ip && ` Dirección: http://${st.lan_ip}:${st.port}`}
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-400">
            <input
              type="checkbox"
              checked={autostart}
              onChange={(e) => syncAutostart(e.target.checked, !!st?.tunnel_running)}
              className="accent-emerald-500"
            />
            Encender al abrir Agentico
          </label>
        </Section>

        {/* 2. Túnel */}
        <Section n={2} title="Acceso desde cualquier red (túnel de Cloudflare)" on={!!st?.tunnel_url}>
          {!st?.cloudflared ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-zinc-500">
                Usa <code className="text-zinc-300">cloudflared</code> (gratis, sin cuenta) para publicar el servidor en
                una dirección <code className="text-zinc-300">https://…trycloudflare.com</code>. No hace falta abrir
                puertos en el router.
              </p>
              <div>
                <Btn onClick={install} busy={busy === "install"}>
                  Instalar cloudflared (winget)
                </Btn>
              </div>
              {busy === "install" && <p className="text-[11px] text-zinc-600">Instalando… puede tardar un minuto.</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-500">
                  {st.tunnel_url ? (
                    <span className="text-emerald-300">{st.tunnel_url}</span>
                  ) : st.tunnel_running ? (
                    <span className="flex items-center gap-1.5">
                      <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" /> Conectando con
                      Cloudflare…
                    </span>
                  ) : (
                    "Túnel apagado"
                  )}
                </span>
                {st.tunnel_running ? (
                  <Btn onClick={tunnelOff} busy={busy === "tunnel"} variant="ghost">
                    Detener
                  </Btn>
                ) : (
                  <Btn onClick={tunnelOn} busy={busy === "tunnel"} disabled={!st.running}>
                    Iniciar túnel
                  </Btn>
                )}
              </div>
              <p className="text-[11px] leading-snug text-zinc-600">
                La dirección cambia cada vez que se inicia el túnel: vuelve a escanear el QR. Para una dirección fija
                usa Tailscale con la opción de red local.
              </p>
            </div>
          )}
        </Section>

        {/* 3. Enlace */}
        <Section n={3} title="Abrir en el teléfono" on={!!link}>
          {!link ? (
            <p className="text-[12px] text-zinc-500">Activa el servidor para ver el enlace.</p>
          ) : (
            <div className="flex gap-4">
              <div
                className="size-44 shrink-0 overflow-hidden rounded-xl bg-white p-1 [&>svg]:size-full"
                dangerouslySetInnerHTML={{ __html: qr ?? "" }}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="text-[12px] text-zinc-400">
                  {source === "tunnel"
                    ? "Escanea el QR con la cámara del teléfono: funciona desde cualquier red."
                    : source === "lan"
                      ? "El teléfono tiene que estar en la misma red Wi-Fi (o en tu Tailscale)."
                      : "Solo funciona en este PC. Inicia el túnel o activa la red local para usarlo en el teléfono."}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Btn onClick={copy} variant="ghost">
                    <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={12} />
                    {copied ? "Copiado" : "Copiar enlace"}
                  </Btn>
                  <Btn onClick={() => void openUrl(link)} variant="ghost">
                    <HugeiconsIcon icon={LinkSquare02Icon} size={12} /> Abrir aquí
                  </Btn>
                </div>
                <div className="mt-auto rounded-lg border border-amber-900/50 bg-amber-950/30 px-2.5 py-2 text-[11px] leading-snug text-amber-200/80">
                  Quien tenga este enlace puede usar Claude en tu PC (y aprobar comandos). No lo compartas.
                  <div className="mt-1.5">
                    {confirmRegen ? (
                      <button
                        type="button"
                        onClick={regen}
                        className="rounded bg-red-600 px-2 py-0.5 font-medium text-white hover:bg-red-500"
                      >
                        ¿Invalidar enlaces anteriores?
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRegen(true)}
                        className="flex items-center gap-1 text-amber-300 hover:text-amber-200"
                      >
                        <HugeiconsIcon icon={Refresh01Icon} size={11} /> Generar enlace nuevo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Section>
      </div>
    </SideDrawer>
  );
}

function Section({ n, title, on, children }: { n: number; title: string; on: boolean; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-[#1a1a1a] p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
            on ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-500",
          )}
        >
          {on ? <HugeiconsIcon icon={Tick02Icon} size={11} /> : n}
        </span>
        <span className="text-[13px] font-medium text-zinc-100">{title}</span>
      </div>
      {children}
    </section>
  );
}

function Btn({
  onClick,
  busy,
  disabled,
  variant = "primary",
  children,
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: "primary" | "ghost";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50",
        variant === "primary"
          ? "bg-emerald-600 text-white hover:bg-emerald-500"
          : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800",
      )}
    >
      {busy && <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" />}
      {children}
    </button>
  );
}

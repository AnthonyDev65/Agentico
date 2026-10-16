import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Tick02Icon,
  Loading03Icon,
  Key01Icon,
  UserIcon,
  ViewIcon,
  ViewOffIcon,
  Delete02Icon,
  Alert02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

// Configuración global de git: identidad, rama por defecto y tokens de acceso
// (guardados con el helper de credenciales de git → Administrador de credenciales
// de Windows; la app no guarda el token en ningún archivo propio).

type GitConfig = {
  installed: boolean;
  version: string;
  name: string;
  email: string;
  default_branch: string;
  credential_helper: string;
};
type TokenStatus = { stored: boolean; username: string };
type TokenCheck = { login: string; name: string; scopes: string };

type Provider = "github" | "gitlab" | "other";
const PROVIDERS: { value: Provider; label: string; host: string; tokenUrl?: string; hint: string }[] = [
  {
    value: "github",
    label: "GitHub",
    host: "github.com",
    tokenUrl: "https://github.com/settings/tokens/new?scopes=repo,workflow&description=Agentico%20IDE",
    hint: "Token clásico con permisos repo (y workflow si usas Actions), o fine-grained con Contents: Read & write.",
  },
  {
    value: "gitlab",
    label: "GitLab",
    host: "gitlab.com",
    tokenUrl: "https://gitlab.com/-/user_settings/personal_access_tokens?name=Agentico%20IDE&scopes=write_repository,read_api",
    hint: "Personal access token con write_repository y read_api.",
  },
  { value: "other", label: "Otro", host: "", hint: "Cualquier servidor git por HTTPS (Bitbucket, Gitea…). Indica el host y tu usuario." },
];

export default function GitSettings() {
  const [cfg, setCfg] = useState<GitConfig | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [branch, setBranch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const c = await invoke<GitConfig>("git_config_get");
    setCfg(c);
    setName(c.name);
    setEmail(c.email);
    setBranch(c.default_branch);
  };
  useEffect(() => {
    load().catch((e) => setErr(String(e)));
  }, []);

  const saveIdentity = async () => {
    setSaving(true);
    setErr(null);
    try {
      await invoke("git_config_set", { name, email, defaultBranch: branch });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      await load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!cfg) {
    return (
      <div className="flex items-center gap-2 p-6 text-xs text-zinc-500">
        <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" /> Leyendo configuración de git…
      </div>
    );
  }
  if (!cfg.installed) {
    return (
      <div className="flex flex-col items-start gap-2 p-6 text-sm text-zinc-400">
        Git no está instalado.
        <button
          type="button"
          onClick={() => openUrl("https://git-scm.com/downloads").catch(() => {})}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500"
        >
          Descargar git
        </button>
      </div>
    );
  }

  const dirty = name !== cfg.name || email !== cfg.email || branch !== cfg.default_branch;

  return (
    <div className="flex flex-col gap-6">
      {/* Identidad */}
      <section className="flex flex-col gap-3">
        <Header icon={UserIcon} title="Identidad" sub={`Aparece como autor en tus commits · ${cfg.version}`} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <Input value={name} onChange={setName} placeholder="Tu Nombre" />
          </Field>
          <Field label="Email">
            <Input value={email} onChange={setEmail} placeholder="tu@email.com" />
          </Field>
          <Field label="Rama por defecto (repos nuevos)">
            <Input value={branch} onChange={setBranch} placeholder="main" mono />
          </Field>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={saveIdentity}
            disabled={!dirty || saving}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {saving && <HugeiconsIcon icon={Loading03Icon} size={13} className="animate-spin" />}
            Guardar identidad
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <HugeiconsIcon icon={Tick02Icon} size={12} /> Guardado
            </span>
          )}
          {!cfg.email && !dirty && (
            <span className="flex items-center gap-1 text-[11px] text-amber-400">
              <HugeiconsIcon icon={Alert02Icon} size={12} /> Sin email no podrás hacer commits
            </span>
          )}
        </div>
      </section>

      <div className="h-px bg-zinc-800" />

      <TokenSection helper={cfg.credential_helper} />

      {err && <pre className="whitespace-pre-wrap text-[11px] text-red-400">{err}</pre>}
    </div>
  );
}

function TokenSection({ helper }: { helper: string }) {
  const [provider, setProvider] = useState<Provider>("github");
  const def = PROVIDERS.find((p) => p.value === provider)!;
  const [host, setHost] = useState(def.host);
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setHost(def.host);
    setMsg(null);
    setToken("");
  }, [provider]);

  const refreshStatus = async (h = host) => {
    if (!h.trim()) return setStatus(null);
    setStatus(null);
    setStatus(await invoke<TokenStatus>("git_token_status", { host: h.trim() }).catch(() => null));
  };
  useEffect(() => {
    const t = setTimeout(() => refreshStatus(host), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);

  const save = async () => {
    if (!token.trim() || !host.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      let user = username.trim();
      let info = "";
      if (provider !== "other") {
        const check = await invoke<TokenCheck>("git_token_verify", { provider, host: host.trim(), token });
        user = check.login || user;
        info = `Conectado como @${check.login}${check.name ? ` (${check.name})` : ""}${
          check.scopes ? ` · permisos: ${check.scopes}` : ""
        }`;
      }
      const usedHelper = await invoke<string>("git_token_save", { host: host.trim(), username: user, token });
      setToken("");
      setMsg({ ok: true, text: `${info || "Token guardado"}. Guardado con «${usedHelper}».` });
      await refreshStatus();
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await invoke("git_token_remove", { host: host.trim() });
      setMsg({ ok: true, text: "Credencial eliminada." });
      await refreshStatus();
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <Header
        icon={Key01Icon}
        title="Token de acceso (HTTPS)"
        sub="Para hacer push/pull sin contraseña. Se guarda en el gestor de credenciales de git (en Windows: Administrador de credenciales), nunca en archivos de Agentico."
      />

      <div className="flex overflow-hidden rounded-md border border-zinc-800 text-xs">
        {PROVIDERS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setProvider(p.value)}
            className={cn(
              "flex-1 px-3 py-1.5 transition-colors",
              provider === p.value ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Host">
          <Input value={host} onChange={setHost} placeholder="git.miempresa.com" mono />
        </Field>
        {provider === "other" && (
          <Field label="Usuario">
            <Input value={username} onChange={setUsername} placeholder="usuario" mono />
          </Field>
        )}
      </div>

      {/* Estado actual */}
      <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-[#121212] px-3 py-2 text-xs">
        {status === null ? (
          <span className="flex items-center gap-1.5 text-zinc-500">
            <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" /> Comprobando…
          </span>
        ) : status.stored ? (
          <>
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="text-zinc-300">
              Credencial guardada para <span className="font-mono">{host}</span>
              {status.username && (
                <>
                  {" "}
                  · usuario <span className="font-mono">{status.username}</span>
                </>
              )}
            </span>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-red-400 hover:bg-red-500/10"
            >
              <HugeiconsIcon icon={Delete02Icon} size={12} /> Quitar
            </button>
          </>
        ) : (
          <>
            <span className="size-2 rounded-full bg-zinc-600" />
            <span className="text-zinc-500">Sin credencial para {host || "este host"}</span>
          </>
        )}
      </div>

      <Field label={status?.stored ? "Reemplazar token" : "Token"}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={show ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder={provider === "github" ? "ghp_… o github_pat_…" : provider === "gitlab" ? "glpat-…" : "token"}
              spellCheck={false}
              autoComplete="off"
              className="h-8 w-full rounded-md border border-zinc-800 bg-[#0d0d10] pl-2.5 pr-8 font-mono text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Ocultar" : "Mostrar"}
              className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center text-zinc-500 hover:text-zinc-200"
            >
              <HugeiconsIcon icon={show ? ViewOffIcon : ViewIcon} size={13} />
            </button>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={!token.trim() || !host.trim() || busy || (provider === "other" && !username.trim())}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {busy && <HugeiconsIcon icon={Loading03Icon} size={13} className="animate-spin" />}
            {provider === "other" ? "Guardar" : "Verificar y guardar"}
          </button>
        </div>
      </Field>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
        <span>{def.hint}</span>
        {def.tokenUrl && (
          <button
            type="button"
            onClick={() => openUrl(def.tokenUrl!).catch(() => {})}
            className="text-indigo-400 hover:text-indigo-300 hover:underline"
          >
            Crear un token en {def.label} ↗
          </button>
        )}
      </div>
      {helper === "store" && (
        <div className="text-[11px] text-amber-400">
          Aviso: el helper «store» guarda las credenciales en texto plano (~/.git-credentials).
        </div>
      )}

      {msg && (
        <div className={cn("rounded-md px-3 py-2 text-xs", msg.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300")}>
          {msg.text}
        </div>
      )}
    </section>
  );
}

function Header({ icon, title, sub }: { icon: any; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <HugeiconsIcon icon={icon} size={16} className="mt-0.5 text-zinc-400" />
      <div>
        <div className="text-sm font-medium text-zinc-100">{title}</div>
        <div className="text-[11px] leading-relaxed text-zinc-500">{sub}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      className={cn(
        "h-8 rounded-md border border-zinc-800 bg-[#0d0d10] px-2.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-indigo-500",
        mono && "font-mono",
      )}
    />
  );
}

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  InternetIcon,
  Database01Icon,
  SearchAreaIcon,
  Refresh01Icon,
  Delete02Icon,
  Edit02Icon,
  Add01Icon,
  Tick02Icon,
  Key01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

type Provider = "hostinger" | "godaddy" | "namecheap";
type HResp = { status: number; body: any };
type RecordSet = { type: string; name: string; ttl: number; contents: string[] };
type DomainItem = { name: string; status?: string; provider: Provider };
type AvailResult = { domain: string; available: boolean; premium?: boolean };

const RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"];

const PROVIDERS: {
  id: Provider;
  label: string;
  badge: string;
  fields: { key: string; label: string; type?: string }[];
  help: string;
}[] = [
  {
    id: "hostinger",
    label: "Hostinger",
    badge: "bg-indigo-500/15 text-indigo-300",
    fields: [{ key: "token", label: "API Token", type: "password" }],
    help: "hPanel → API · developers.hostinger.com",
  },
  {
    id: "godaddy",
    label: "GoDaddy",
    badge: "bg-emerald-500/15 text-emerald-300",
    fields: [
      { key: "key", label: "API Key" },
      { key: "secret", label: "API Secret", type: "password" },
    ],
    help: "developer.godaddy.com → API Keys (entorno Production)",
  },
  {
    id: "namecheap",
    label: "Namecheap",
    badge: "bg-orange-500/15 text-orange-300",
    fields: [
      { key: "api_user", label: "API User" },
      { key: "api_key", label: "API Key", type: "password" },
      { key: "username", label: "Username (si difiere del API User)" },
      { key: "client_ip", label: "IP en whitelist" },
    ],
    help: "Profile → Tools → API Access (habilitar API + whitelist de tu IP)",
  },
];
const META = (p: Provider) => PROVIDERS.find((x) => x.id === p)!;

// ───────────────────────── helpers comunes ─────────────────────────

async function dreq(provider: Provider, method: string, path: string, body?: unknown): Promise<HResp> {
  return invoke<HResp>("domain_request", { provider, method, path, body: body ?? null });
}

const asArray = (b: any): any[] =>
  Array.isArray(b) ? b : Array.isArray(b?.data) ? b.data : Array.isArray(b?.zone) ? b.zone : [];

function errMsg(r: HResp): string {
  const b = r.body;
  if (b && typeof b === "object") {
    if (b.message) return String(b.message);
    if (b.errors) return JSON.stringify(b.errors);
  }
  if (typeof b === "string" && b.trim()) return b.slice(0, 300);
  return `Error HTTP ${r.status}`;
}
function ensureOk(r: HResp): any {
  if (r.status < 200 || r.status >= 300) throw new Error(errMsg(r));
  return r.body;
}

function domainName(d: any): string {
  if (typeof d === "string") return d;
  for (const k of ["domain", "name", "domain_name", "unicode", "punycode"]) {
    const v = d?.[k];
    if (typeof v === "string" && v) return v;
    if (v && typeof v === "object") {
      const inner = v.name ?? v.domain ?? v.unicode ?? v.punycode;
      if (typeof inner === "string" && inner) return inner;
    }
  }
  for (const v of Object.values(d ?? {})) {
    if (typeof v === "string" && /^[^\s]+\.[a-z]{2,}$/i.test(v)) return v;
  }
  return "(sin nombre)";
}

function splitDomain(domain: string): { sld: string; tld: string } {
  const i = domain.indexOf(".");
  return i < 0 ? { sld: domain, tld: "" } : { sld: domain.slice(0, i), tld: domain.slice(i + 1) };
}

function ncParse(body: any): Document {
  const doc = new DOMParser().parseFromString(typeof body === "string" ? body : "", "text/xml");
  const resp = doc.querySelector("ApiResponse");
  if (!resp) throw new Error("Respuesta de Namecheap no válida (¿IP sin whitelist?)");
  if (resp.getAttribute("Status") === "ERROR") {
    throw new Error(doc.querySelector("Errors Error")?.textContent || "Error de Namecheap");
  }
  return doc;
}

function groupRecords(
  rows: any[],
  get: (r: any) => { type: string; name: string; ttl: number; content: string },
): RecordSet[] {
  const map = new Map<string, RecordSet>();
  for (const r of rows) {
    const { type, name, ttl, content } = get(r);
    const key = `${type}|${name}`;
    if (!map.has(key)) map.set(key, { type, name: name || "@", ttl, contents: [] });
    if (content) map.get(key)!.contents.push(content);
  }
  return [...map.values()];
}

const mxSplit = (c: string): { pref: string; addr: string } => {
  const m = c.match(/^(\d+)\s+(.*)$/);
  return m ? { pref: m[1], addr: m[2] } : { pref: "10", addr: c };
};

// ───────────────────────── adaptadores por proveedor ─────────────────────────

type Adapter = {
  list: () => Promise<DomainItem[]>;
  getDns: (domain: string) => Promise<RecordSet[]>;
  putSet: (domain: string, rs: RecordSet) => Promise<void>;
  delSet: (domain: string, rs: RecordSet) => Promise<void>;
  avail: (sld: string, tlds: string[]) => Promise<AvailResult[]>;
};

const ADAPTERS: Record<Provider, Adapter> = {
  hostinger: {
    list: async () => {
      const body = ensureOk(await dreq("hostinger", "GET", "/api/domains/v1/portfolio"));
      const seen = new Set<string>();
      return asArray(body)
        .map((d) => ({ name: domainName(d), status: d.status ?? d.domain_status, provider: "hostinger" as const }))
        .filter((d) => d.name !== "(sin nombre)" && (seen.has(d.name) ? false : (seen.add(d.name), true)));
    },
    getDns: async (domain) => {
      const body = ensureOk(await dreq("hostinger", "GET", `/api/dns/v1/zones/${encodeURIComponent(domain)}`));
      return asArray(body).map((rs: any) => ({
        type: rs.type ?? "A",
        name: rs.name ?? "@",
        ttl: Number(rs.ttl ?? 3600),
        contents: Array.isArray(rs.records)
          ? rs.records.map((x: any) => (typeof x === "string" ? x : x?.content ?? "")).filter(Boolean)
          : [],
      }));
    },
    putSet: async (domain, rs) => {
      ensureOk(
        await dreq("hostinger", "PUT", `/api/dns/v1/zones/${encodeURIComponent(domain)}`, {
          overwrite: true,
          zone: [
            {
              name: rs.name || "@",
              type: rs.type,
              ttl: rs.ttl || 3600,
              records: rs.contents.map((content) => ({ content })),
            },
          ],
        }),
      );
    },
    delSet: async (domain, rs) => {
      ensureOk(
        await dreq("hostinger", "DELETE", `/api/dns/v1/zones/${encodeURIComponent(domain)}`, {
          filters: [{ name: rs.name, type: rs.type }],
        }),
      );
    },
    avail: async (sld, tlds) => {
      const body = ensureOk(
        await dreq("hostinger", "POST", "/api/domains/v1/availability", {
          domain: sld,
          tlds,
          with_alternatives: false,
        }),
      );
      return asArray(body).map((d: any) => ({
        domain: domainName(d),
        available: d.is_available ?? d.available ?? false,
        premium: d.is_premium,
      }));
    },
  },

  godaddy: {
    list: async () => {
      const body = ensureOk(await dreq("godaddy", "GET", "/v1/domains?limit=1000"));
      return asArray(body)
        .map((d: any) => ({ name: d.domain, status: d.status, provider: "godaddy" as const }))
        .filter((d) => d.name);
    },
    getDns: async (domain) => {
      const body = ensureOk(await dreq("godaddy", "GET", `/v1/domains/${domain}/records`));
      return groupRecords(asArray(body), (r) => ({
        type: r.type,
        name: r.name || "@",
        ttl: Number(r.ttl ?? 3600),
        content: r.type === "MX" ? `${r.priority ?? 0} ${r.data}` : r.data,
      }));
    },
    putSet: async (domain, rs) => {
      const records = rs.contents.map((c) => {
        if (rs.type === "MX") {
          const { pref, addr } = mxSplit(c);
          return { data: addr, ttl: rs.ttl, priority: Number(pref) };
        }
        return { data: c, ttl: rs.ttl };
      });
      ensureOk(
        await dreq(
          "godaddy",
          "PUT",
          `/v1/domains/${domain}/records/${rs.type}/${encodeURIComponent(rs.name)}`,
          records,
        ),
      );
    },
    delSet: async (domain, rs) => {
      ensureOk(
        await dreq(
          "godaddy",
          "DELETE",
          `/v1/domains/${domain}/records/${rs.type}/${encodeURIComponent(rs.name)}`,
        ),
      );
    },
    avail: async (sld, tlds) => {
      const body = ensureOk(
        await dreq("godaddy", "POST", "/v1/domains/available?checkType=FAST", tlds.map((t) => `${sld}.${t}`)),
      );
      return asArray(body.domains ?? body).map((d: any) => ({
        domain: d.domain,
        available: !!d.available,
      }));
    },
  },

  namecheap: {
    list: async () => {
      const r = await dreq("namecheap", "GET", "?Command=namecheap.domains.getList&PageSize=100");
      const doc = ncParse(r.body);
      return [...doc.querySelectorAll("DomainGetListResult Domain")]
        .map((d) => ({
          name: d.getAttribute("Name") || "",
          status: d.getAttribute("IsExpired") === "true" ? "expired" : "active",
          provider: "namecheap" as const,
        }))
        .filter((d) => d.name);
    },
    getDns: async (domain) => {
      const { sld, tld } = splitDomain(domain);
      const r = await dreq(
        "namecheap",
        "GET",
        `?Command=namecheap.domains.dns.getHosts&SLD=${sld}&TLD=${tld}`,
      );
      const doc = ncParse(r.body);
      const rows = [...doc.querySelectorAll("DomainDNSGetHostsResult host")];
      return groupRecords(rows, (h: Element) => {
        const type = h.getAttribute("Type") || "A";
        const addr = h.getAttribute("Address") || "";
        const mx = h.getAttribute("MXPref");
        return {
          type,
          name: h.getAttribute("Name") || "@",
          ttl: Number(h.getAttribute("TTL") || 1800),
          content: type === "MX" && mx ? `${mx} ${addr}` : addr,
        };
      });
    },
    putSet: async (domain, rs) => {
      const all = await ADAPTERS.namecheap.getDns(domain);
      const next = [...all.filter((s) => !(s.type === rs.type && s.name === rs.name)), rs];
      await ncSetAll(domain, next);
    },
    delSet: async (domain, rs) => {
      const all = await ADAPTERS.namecheap.getDns(domain);
      await ncSetAll(
        domain,
        all.filter((s) => !(s.type === rs.type && s.name === rs.name)),
      );
    },
    avail: async (sld, tlds) => {
      const list = tlds.map((t) => `${sld}.${t}`).join(",");
      const r = await dreq(
        "namecheap",
        "GET",
        `?Command=namecheap.domains.check&DomainList=${encodeURIComponent(list)}`,
      );
      const doc = ncParse(r.body);
      return [...doc.querySelectorAll("DomainCheckResult")].map((d) => ({
        domain: d.getAttribute("Domain") || "",
        available: d.getAttribute("Available") === "true",
        premium: d.getAttribute("IsPremiumName") === "true",
      }));
    },
  },
};

// Namecheap setHosts reemplaza TODA la zona → reenviamos el set completo.
async function ncSetAll(domain: string, sets: RecordSet[]) {
  const { sld, tld } = splitDomain(domain);
  const parts = [`SLD=${sld}`, `TLD=${tld}`];
  let i = 1;
  for (const rs of sets) {
    for (const c of rs.contents) {
      let addr = c;
      let mx = "";
      if (rs.type === "MX") {
        const s = mxSplit(c);
        mx = s.pref;
        addr = s.addr;
      }
      parts.push(`HostName${i}=${encodeURIComponent(rs.name || "@")}`);
      parts.push(`RecordType${i}=${rs.type}`);
      parts.push(`Address${i}=${encodeURIComponent(addr)}`);
      parts.push(`TTL${i}=${rs.ttl || 1800}`);
      if (rs.type === "MX") parts.push(`MXPref${i}=${mx || "10"}`);
      i++;
    }
  }
  const r = await dreq("namecheap", "GET", `?Command=namecheap.domains.dns.setHosts&${parts.join("&")}`);
  ncParse(r.body);
}

// ───────────────────────── componente principal ─────────────────────────

export default function DomainManager({ onClose }: { onClose: () => void }) {
  const [configured, setConfigured] = useState<Record<Provider, boolean> | null>(null);
  const [tab, setTab] = useState<"domains" | "availability" | "settings">("domains");
  const [visible, setVisible] = useState(false);

  const loadCreds = async () => {
    try {
      const c = await invoke<Record<Provider, boolean>>("domain_creds_get");
      setConfigured(c);
      return c;
    } catch {
      const empty = { hostinger: false, godaddy: false, namecheap: false };
      setConfigured(empty);
      return empty;
    }
  };

  useEffect(() => {
    loadCreds().then((c) => {
      if (!c.hostinger && !c.godaddy && !c.namecheap) setTab("settings");
    });
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const anyConfigured = !!configured && (configured.hostinger || configured.godaddy || configured.namecheap);

  return createPortal(
    <>
      <div
        onMouseDown={handleClose}
        className={cn(
          "fixed inset-0 z-[79] bg-black/40 transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        className={cn(
          "fixed bottom-3 left-3 top-11 z-[80] flex w-[960px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#161616] shadow-2xl shadow-black/60 transition-transform duration-300 ease-out",
          visible ? "translate-x-0" : "-translate-x-[130%]",
        )}
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-800 bg-[#1a1a1a] px-4">
          <HugeiconsIcon icon={InternetIcon} size={16} className="text-indigo-400" />
          <span className="text-sm font-semibold text-zinc-100">Dominios</span>

          <div className="ml-4 flex items-stretch gap-1">
            <TabBtn active={tab === "domains"} onClick={() => setTab("domains")} icon={Database01Icon}>
              Mis dominios
            </TabBtn>
            <TabBtn active={tab === "availability"} onClick={() => setTab("availability")} icon={SearchAreaIcon}>
              Disponibilidad
            </TabBtn>
            <TabBtn active={tab === "settings"} onClick={() => setTab("settings")} icon={Key01Icon}>
              Proveedores
            </TabBtn>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="ml-auto flex size-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {configured === null ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">cargando…</div>
          ) : tab === "settings" ? (
            <SettingsTab configured={configured} onChanged={loadCreds} />
          ) : !anyConfigured ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-zinc-500">
              No hay proveedores configurados.
              <button
                type="button"
                onClick={() => setTab("settings")}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500"
              >
                Configurar proveedor
              </button>
            </div>
          ) : tab === "domains" ? (
            <DomainsTab configured={configured} />
          ) : (
            <AvailabilityTab configured={configured} />
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200",
      )}
    >
      <HugeiconsIcon icon={icon} size={13} />
      {children}
    </button>
  );
}

function Badge({ provider }: { provider: Provider }) {
  const m = META(provider);
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide", m.badge)}>
      {m.label}
    </span>
  );
}

// ───────────────────────── Proveedores (credenciales) ─────────────────────────

function SettingsTab({
  configured,
  onChanged,
}: {
  configured: Record<Provider, boolean>;
  onChanged: () => void;
}) {
  return (
    <div className="h-full overflow-auto p-5">
      <div className="mx-auto flex max-w-[620px] flex-col gap-4">
        {PROVIDERS.map((p) => (
          <ProviderCard key={p.id} meta={p} enabled={configured[p.id]} onChanged={onChanged} />
        ))}
        <p className="text-[11px] leading-relaxed text-zinc-600">
          Las credenciales se guardan localmente en tu equipo y solo se usan desde el backend para
          llamar a la API de cada proveedor. GoDaddy requiere una API Key de <b>Production</b> (y una
          cuenta con dominios suficientes). Namecheap requiere habilitar el acceso a API y{" "}
          <b>whitelistear tu IP pública</b>.
        </p>
      </div>
    </div>
  );
}

function ProviderCard({
  meta,
  enabled,
  onChanged,
}: {
  meta: (typeof PROVIDERS)[number];
  enabled: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await invoke("domain_creds_set", { provider: meta.id, value: vals });
      setEditing(false);
      setVals({});
      onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    await invoke("domain_creds_clear", { provider: meta.id }).catch(() => {});
    onChanged();
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#1a1a1a] p-4">
      <div className="flex items-center gap-2">
        <Badge provider={meta.id} />
        <span className="text-sm font-medium text-zinc-100">{meta.label}</span>
        {enabled && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-400">
            <HugeiconsIcon icon={Tick02Icon} size={12} /> configurado
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {enabled && !editing && (
            <button
              type="button"
              onClick={clear}
              className="rounded px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-red-300"
            >
              Quitar
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
          >
            {editing ? "Cancelar" : enabled ? "Cambiar" : "Configurar"}
          </button>
        </div>
      </div>
      <div className="mt-1 text-[11px] text-zinc-600">{meta.help}</div>

      {editing && (
        <div className="mt-3 flex flex-col gap-2">
          {meta.fields.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">{f.label}</span>
              <input
                type={f.type ?? "text"}
                value={vals[f.key] ?? ""}
                onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                spellCheck={false}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              />
            </label>
          ))}
          {err && <div className="text-[11px] text-red-400">{err}</div>}
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="mt-1 self-start rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Mis dominios ─────────────────────────

function DomainsTab({ configured }: { configured: Record<Provider, boolean> }) {
  const [domains, setDomains] = useState<DomainItem[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<DomainItem | null>(null);

  const active = PROVIDERS.map((p) => p.id).filter((id) => configured[id]);

  const load = async () => {
    setLoading(true);
    setErrors([]);
    const all: DomainItem[] = [];
    const errs: string[] = [];
    await Promise.all(
      active.map(async (p) => {
        try {
          all.push(...(await ADAPTERS[p].list()));
        } catch (e) {
          errs.push(`${META(p).label}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }),
    );
    all.sort((a, b) => a.name.localeCompare(b.name));
    setDomains(all);
    setErrors(errs);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[300px] shrink-0 flex-col border-r border-zinc-800">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800 px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          Dominios
          <button
            type="button"
            onClick={load}
            title="Actualizar"
            className="ml-auto flex size-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={13} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-1">
          {loading && <div className="px-3 py-2 text-xs text-zinc-500">cargando…</div>}
          {errors.map((e, i) => (
            <div
              key={i}
              className="m-2 rounded border border-red-900/50 bg-red-950/30 px-2 py-1.5 text-[11px] text-red-300"
            >
              {e}
            </div>
          ))}
          {domains?.length === 0 && !loading && (
            <div className="px-3 py-2 text-xs text-zinc-600">No hay dominios.</div>
          )}
          {domains?.map((d, i) => (
            <button
              key={d.provider + d.name + i}
              type="button"
              onClick={() => setSelected(d)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left",
                selected?.name === d.name && selected?.provider === d.provider
                  ? "bg-indigo-600/20"
                  : "hover:bg-zinc-800/60",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-zinc-100">{d.name}</div>
                {d.status && (
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">{d.status}</div>
                )}
              </div>
              <Badge provider={d.provider} />
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {selected ? (
          <DnsEditor key={selected.provider + selected.name} item={selected} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-600">
            Selecciona un dominio para gestionar su DNS.
          </div>
        )}
      </div>
    </div>
  );
}

function DnsEditor({ item }: { item: DomainItem }) {
  const adapter = ADAPTERS[item.provider];
  const [sets, setSets] = useState<RecordSet[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<RecordSet>({ type: "A", name: "@", ttl: 3600, contents: [""] });
  const [adding, setAdding] = useState(false);
  const [newRec, setNewRec] = useState<RecordSet>({ type: "A", name: "@", ttl: 3600, contents: [""] });

  const load = async () => {
    setError("");
    setSets(null);
    try {
      setSets(await adapter.getDns(item.name));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSets([]);
    }
  };

  useEffect(() => {
    load();
    setEditIdx(null);
    setAdding(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.name, item.provider]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setEditIdx(null);
      setAdding(false);
      setNewRec({ type: "A", name: "@", ttl: 3600, contents: [""] });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = (rs: RecordSet) => {
    const contents = rs.contents.map((c) => c.trim()).filter(Boolean);
    if (!contents.length) {
      setError("El registro necesita al menos un valor.");
      return;
    }
    run(() => adapter.putSet(item.name, { ...rs, name: rs.name.trim() || "@", contents }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800 px-3">
        <span className="truncate text-sm font-medium text-zinc-100">{item.name}</span>
        <Badge provider={item.provider} />
        <span className="text-[11px] text-zinc-600">· DNS</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setAdding((v) => !v);
              setEditIdx(null);
            }}
            className="flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-500"
          >
            <HugeiconsIcon icon={Add01Icon} size={12} /> Agregar
          </button>
          <button
            type="button"
            onClick={load}
            title="Actualizar"
            className="flex size-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={13} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded border border-red-900/50 bg-red-950/30 px-2 py-1.5 text-[11px] text-red-300">
          {error}
        </div>
      )}
      {item.provider === "namecheap" && (
        <div className="mx-3 mt-2 rounded border border-orange-900/40 bg-orange-950/20 px-2 py-1 text-[10px] text-orange-300/80">
          Namecheap reemplaza la zona completa en cada cambio; se reenvían todos los registros.
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {adding && (
          <RecordForm
            value={newRec}
            onChange={setNewRec}
            onSubmit={() => save(newRec)}
            onCancel={() => setAdding(false)}
            busy={busy}
            submitLabel="Crear registro"
          />
        )}

        {sets === null && !error && <div className="text-xs text-zinc-500">cargando…</div>}
        {sets?.length === 0 && !error && <div className="text-xs text-zinc-600">Sin registros DNS.</div>}

        <div className="mt-1 overflow-hidden rounded-lg border border-zinc-800">
          {sets?.map((rs, i) =>
            editIdx === i ? (
              <div key={i} className="border-b border-zinc-800 p-3 last:border-0">
                <RecordForm
                  value={draft}
                  onChange={setDraft}
                  onSubmit={() => save(draft)}
                  onCancel={() => setEditIdx(null)}
                  busy={busy}
                  submitLabel="Guardar"
                  lockTypeName
                />
              </div>
            ) : (
              <div
                key={i}
                className="flex items-center gap-3 border-b border-zinc-800 px-3 py-2 text-[12px] last:border-0 hover:bg-zinc-900/40"
              >
                <span className="w-14 shrink-0 font-mono font-semibold text-indigo-300">{rs.type}</span>
                <span className="w-32 shrink-0 truncate font-mono text-zinc-300" title={rs.name}>
                  {rs.name}
                </span>
                <span
                  className="min-w-0 flex-1 truncate font-mono text-zinc-400"
                  title={rs.contents.join(", ")}
                >
                  {rs.contents.join(", ")}
                </span>
                <span className="w-14 shrink-0 text-right tabular-nums text-zinc-600">{rs.ttl}s</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({ ...rs, contents: [...rs.contents] });
                      setEditIdx(i);
                      setAdding(false);
                    }}
                    title="Editar"
                    className="flex size-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    <HugeiconsIcon icon={Edit02Icon} size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => run(() => adapter.delSet(item.name, rs))}
                    title="Borrar"
                    className="flex size-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-red-400"
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={13} />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function RecordForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  busy,
  submitLabel,
  lockTypeName,
}: {
  value: RecordSet;
  onChange: (v: RecordSet) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
  submitLabel: string;
  lockTypeName?: boolean;
}) {
  const set = (patch: Partial<RecordSet>) => onChange({ ...value, ...patch });
  return (
    <div className="mb-3 rounded-lg border border-indigo-900/40 bg-indigo-950/10 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Tipo">
          <select
            value={value.type}
            disabled={lockTypeName}
            onChange={(e) => set({ type: e.target.value })}
            className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-indigo-500 disabled:opacity-60"
          >
            {RECORD_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Nombre">
          <input
            value={value.name}
            disabled={lockTypeName}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="@ o www"
            spellCheck={false}
            className="w-32 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-indigo-500 disabled:opacity-60"
          />
        </Field>
        <Field label="TTL (s)">
          <input
            type="number"
            value={value.ttl}
            onChange={(e) => set({ ttl: Number(e.target.value) || 3600 })}
            className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-indigo-500"
          />
        </Field>
      </div>
      <Field label={value.type === "MX" ? 'Valor(es) — "prioridad destino", uno por línea' : "Valor(es) — uno por línea"}>
        <textarea
          value={value.contents.join("\n")}
          onChange={(e) => set({ contents: e.target.value.split("\n") })}
          rows={Math.min(5, Math.max(1, value.contents.length))}
          placeholder={value.type === "MX" ? "10 mail.ejemplo.com" : "1.2.3.4"}
          spellCheck={false}
          className="w-full resize-y rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-indigo-500"
        />
      </Field>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className="flex items-center gap-1 rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          <HugeiconsIcon icon={Tick02Icon} size={12} /> {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

// ───────────────────────── Disponibilidad ─────────────────────────

function AvailabilityTab({ configured }: { configured: Record<Provider, boolean> }) {
  const active = PROVIDERS.map((p) => p.id).filter((id) => configured[id]);
  const [provider, setProvider] = useState<Provider>(active[0]);
  const [name, setName] = useState("");
  const [tlds, setTlds] = useState("com, net, org, io, dev");
  const [results, setResults] = useState<AvailResult[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const check = async () => {
    const sld = name.trim().replace(/\..*$/, "");
    if (!sld) return;
    const list = tlds
      .split(",")
      .map((t) => t.trim().replace(/^\./, ""))
      .filter(Boolean);
    setLoading(true);
    setError("");
    setResults(null);
    try {
      setResults(await ADAPTERS[provider].avail(sld, list));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-[640px] flex-col gap-4 p-6">
      <div className="flex items-end gap-2">
        <Field label="Proveedor">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
          >
            {active.map((p) => (
              <option key={p} value={p}>
                {META(p).label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nombre (sin extensión)">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") check();
            }}
            placeholder="mi-proyecto"
            spellCheck={false}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
          />
        </Field>
        <button
          type="button"
          onClick={check}
          disabled={loading || !name.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          <HugeiconsIcon icon={SearchAreaIcon} size={14} /> Buscar
        </button>
      </div>
      <Field label="Extensiones (separadas por coma)">
        <input
          value={tlds}
          onChange={(e) => setTlds(e.target.value)}
          spellCheck={false}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
      </Field>

      {error && (
        <div className="rounded border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {loading && <div className="text-sm text-zinc-500">consultando…</div>}
        {results?.map((d, i) => (
          <div
            key={d.domain + i}
            className="flex items-center gap-3 border-b border-zinc-800 py-2 text-sm last:border-0"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-zinc-200">{d.domain}</span>
            {d.premium && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-400">
                premium
              </span>
            )}
            <span
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-medium",
                d.available ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-700/40 text-zinc-400",
              )}
            >
              {d.available ? "Disponible" : "Ocupado"}
            </span>
          </div>
        ))}
        {results?.length === 0 && !loading && <div className="text-sm text-zinc-600">Sin resultados.</div>}
      </div>
    </div>
  );
}

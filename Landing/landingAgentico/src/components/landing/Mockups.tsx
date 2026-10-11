import {
  Folder,
  FileCode2,
  FileJson,
  Check,
  X,
  Smartphone,
  Monitor,
  Globe,
  ArrowUp,
  CircleDot,
  ChevronRight,
  ChevronDown,
  GitBranch,
  Puzzle,
  Box,
  Plug,
  TerminalSquare,
  Play,
  Package,
  Clock,
  AtSign,
  ImagePlus,
  Minus,
  Square,
  Code2,
  MessageSquare,
  Plus,
  Sparkles,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { cx } from './ui';

/** macOS-style window chrome with traffic lights + optional title. */
export function WindowChrome({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 shadow-2xl shadow-black/40 backdrop-blur',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
        <span className="size-3 rounded-full bg-[#ff5f57]" />
        <span className="size-3 rounded-full bg-[#febc2e]" />
        <span className="size-3 rounded-full bg-[#28c840]" />
        {title && (
          <span className="ml-3 truncate text-xs font-medium text-zinc-500">
            {title}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

const ideTree = [
  { icon: Folder, label: 'dist', dir: true, indent: 0 },
  { icon: Folder, label: 'src', dir: true, indent: 0 },
  { icon: FileCode2, label: 'App.tsx', indent: 1, color: 'text-sky-400' },
  { icon: FileCode2, label: 'Workspace.tsx', indent: 1, active: true, color: 'text-sky-400' },
  { icon: FileCode2, label: 'ChatView.tsx', indent: 1, color: 'text-sky-400' },
  { icon: Folder, label: 'components', dir: true, indent: 1 },
  { icon: FileCode2, label: 'vite.config.ts', indent: 0, color: 'text-sky-400' },
  { icon: FileJson, label: 'package.json', indent: 0, color: 'text-amber-300' },
];

const CODE: ReactNode[] = [
  <>
    <span className="text-sky-400">import</span>{' '}
    <span className="text-zinc-300">{'{ useState }'}</span>{' '}
    <span className="text-sky-400">from</span> <span className="text-emerald-300">"react"</span>;
  </>,
  <>
    <span className="text-sky-400">import</span> <span className="text-zinc-300">TerminalPanel</span>{' '}
    <span className="text-sky-400">from</span>{' '}
    <span className="text-emerald-300">"@/components/TerminalPanel"</span>;
  </>,
  <>{' '}</>,
  <>
    <span className="text-sky-400">export default function</span>{' '}
    <span className="text-amber-300">Workspace</span>() {'{'}
  </>,
  <>
    {'  '}
    <span className="text-sky-400">const</span> [phoneMode, setPhoneMode] ={' '}
    <span className="text-amber-300">useState</span>(<span className="text-sky-400">false</span>);
  </>,
  <>{' '}</>,
  <>
    {'  '}
    <span className="text-sky-400">return</span> (
  </>,
  <>
    {'    '}
    <span className="text-zinc-500">&lt;</span>
    <span className="text-rose-300">div</span>{' '}
    <span className="text-amber-300">className</span>=
    <span className="text-emerald-300">"flex h-full"</span>
    <span className="text-zinc-500">&gt;</span>
  </>,
  <>
    {'      '}
    <span className="text-zinc-500">&lt;</span>
    <span className="text-rose-300">TerminalPanel</span>{' '}
    <span className="text-amber-300">project</span>=<span className="text-zinc-300">{'{project}'}</span>{' '}
    <span className="text-zinc-500">/&gt;</span>
  </>,
  <>
    {'      '}
    <span className="text-zinc-300">{'{'}</span>phoneMode{' '}
    <span className="text-sky-400">&amp;&amp;</span>{' '}
    <span className="text-zinc-500">&lt;</span>
    <span className="text-rose-300">PhonePreview</span>{' '}
    <span className="text-zinc-500">/&gt;</span>
    <span className="text-zinc-300">{'}'}</span>
  </>,
  <>
    {'    '}
    <span className="text-zinc-500">&lt;/</span>
    <span className="text-rose-300">div</span>
    <span className="text-zinc-500">&gt;</span>
  </>,
  <>{'  );'}</>,
  <>{'}'}</>,
];

function ViewTab({
  icon: Icon,
  active,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'flex items-center gap-1.5 rounded-md px-2 py-1 font-medium',
        active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400',
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="hidden sm:inline">{children}</span>
    </span>
  );
}

/** Réplica fiel y estática del IDE real de Agentico, para el hero. */
export function HeroMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#121212] shadow-2xl shadow-black/50">
      {/* Barra de pestañas de proyectos */}
      <div className="flex h-9 items-stretch border-b border-zinc-800 bg-[#121212] text-xs">
        <div className="flex items-center px-3">
          <Sparkles className="size-4 text-amber-400" />
        </div>
        <div className="hidden items-center gap-2 border-r border-zinc-800 px-3 text-zinc-400 sm:flex">
          <span className="grid size-4 place-items-center rounded-[3px] bg-zinc-700 text-[8px] font-bold text-zinc-200">
            R
          </span>
          RaynierCaster
        </div>
        <div className="flex items-center gap-2 border-r border-zinc-800 bg-[#1e1e1e] px-3 text-zinc-100">
          <span className="grid size-4 place-items-center rounded-[3px] bg-emerald-500 text-[8px] font-bold text-white">
            ko
          </span>
          frontend-react
          <X className="size-3 text-zinc-500" />
        </div>
        <div className="flex w-8 items-center justify-center text-zinc-500">
          <Plus className="size-3.5" />
        </div>
        <div className="flex-1" />
        <div className="flex items-stretch text-zinc-500">
          <div className="hidden w-9 items-center justify-center sm:flex">
            <Globe className="size-3.5" />
          </div>
          <div className="flex w-9 items-center justify-center">
            <Minus className="size-3.5" />
          </div>
          <div className="flex w-9 items-center justify-center">
            <Square className="size-3" />
          </div>
          <div className="flex w-9 items-center justify-center">
            <X className="size-3.5" />
          </div>
        </div>
      </div>

      {/* Barra de vistas + acciones */}
      <div className="flex h-9 items-center gap-0.5 overflow-hidden border-b border-zinc-800 bg-zinc-900/40 px-2 text-xs">
        <ViewTab icon={Code2} active>
          Código
        </ViewTab>
        <ViewTab icon={GitBranch}>Git</ViewTab>
        <ViewTab icon={Puzzle}>Skills</ViewTab>
        <ViewTab icon={Box}>Librerías</ViewTab>
        <ViewTab icon={Plug}>MCP</ViewTab>
        <ViewTab icon={Sparkles}>Claude</ViewTab>
        <ViewTab icon={TerminalSquare}>Terminal</ViewTab>
        <ViewTab icon={Globe}>Web</ViewTab>
        <div className="ml-auto flex items-center gap-1">
          <span className="flex items-center gap-1.5 rounded-md bg-emerald-600/90 px-2.5 py-1 font-medium text-white">
            <Play className="size-3.5" /> Ejecutar
            <span className="ml-0.5 flex items-center border-l border-emerald-900/40 pl-1">
              <ChevronDown className="size-3" />
            </span>
          </span>
          <span className="hidden items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1 text-zinc-200 md:flex">
            <Package className="size-3.5" /> Compilar
          </span>
        </div>
      </div>

      {/* Cuerpo: árbol + editor + chat */}
      <div className="grid h-[560px] grid-cols-[170px_1fr] text-xs leading-relaxed sm:h-[680px] sm:grid-cols-[210px_1fr_340px] sm:text-[13px]">
        {/* Árbol de archivos */}
        <aside className="border-r border-zinc-800 bg-[#121212] p-2">
          <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
            Explorador
          </div>
          <ul className="space-y-0.5">
            {ideTree.map((n) => {
              const Icon = n.icon;
              return (
                <li
                  key={n.label}
                  className={cx(
                    'flex items-center gap-1.5 rounded px-1 py-0.5',
                    n.active ? 'bg-indigo-600/20 text-zinc-100' : 'text-zinc-400',
                  )}
                  style={{ paddingLeft: `${0.25 + n.indent * 0.7}rem` }}
                >
                  {n.dir ? (
                    <ChevronRight className="size-3 shrink-0 text-zinc-600" />
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <Icon className={cx('size-3.5 shrink-0', n.dir ? 'text-amber-400/80' : n.color)} />
                  <span className="truncate">{n.label}</span>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Editor de código */}
        <div className="flex min-w-0 flex-col bg-[#121212]">
          <div className="flex h-8 items-stretch border-b border-zinc-800">
            <div className="flex items-center gap-2 border-r border-zinc-800 bg-[#1e1e1e] px-3 text-zinc-100">
              <FileCode2 className="size-3 text-sky-400" /> Workspace.tsx
              <span className="size-1.5 rounded-full bg-zinc-500" />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-3 font-mono text-[11px] leading-[1.7] sm:text-[12px]">
            {CODE.map((line, i) => (
              <div key={i} className="flex gap-3">
                <span className="w-4 shrink-0 select-none text-right text-zinc-700">{i + 1}</span>
                <span className="min-w-0 whitespace-pre text-zinc-300">{line}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chat de IA */}
        <div className="hidden min-w-0 flex-col border-l border-zinc-800 bg-[#121212] sm:flex">
          <div className="flex h-9 items-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-3 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            <MessageSquare className="size-3.5" /> Chat
            <span className="normal-case tracking-normal text-zinc-600">· frontend-react</span>
            <Clock className="ml-auto size-3.5 text-zinc-500" />
          </div>
          <div className="flex items-center gap-3 border-b border-zinc-800/60 px-3 py-1 text-[10px] text-zinc-500">
            <span className="font-medium text-zinc-300">$0.0297</span>
            <span className="flex items-center gap-0.5">
              <ArrowUp className="size-2.5" /> 12.3k
            </span>
            <span className="flex items-center gap-0.5">
              <ChevronDown className="size-2.5" /> 4.5k
            </span>
            <span className="ml-auto text-zinc-600">2 turnos</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3 text-[11px]">
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-3 py-1.5 text-white">
              Añade un hero con dos botones y un badge.
            </div>
            <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-zinc-800 bg-zinc-800/50 px-3 py-1.5 text-zinc-300">
              Listo, edité <span className="font-medium text-zinc-100">Hero.tsx</span> y añadí los
              botones.
            </div>
            <div className="max-w-[90%] rounded-lg border border-zinc-800 bg-zinc-900/70">
              <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-zinc-400">
                <Package className="size-3 text-indigo-400" /> Edit
                <Check className="ml-auto size-3 text-emerald-400" />
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/60 font-mono text-[10px]">
              <div className="flex justify-between border-b border-zinc-800 px-3 py-1 text-[9px] text-zinc-500">
                <span>Hero.tsx</span>
                <span className="text-emerald-400">+12 −2</span>
              </div>
              <pre className="px-3 py-1.5 leading-relaxed">
                <div className="text-rose-300/80">- &lt;h1&gt;Hola&lt;/h1&gt;</div>
                <div className="text-emerald-300/90">+ &lt;Hero cta badge /&gt;</div>
              </pre>
            </div>
          </div>
          <div className="p-2.5">
            <div className="rounded-2xl border border-zinc-800 bg-[#1a1a1a] p-2.5">
              <div className="mb-1 flex items-center gap-1">
                <span className="grid size-6 place-items-center rounded-full bg-indigo-600 text-white">
                  <AtSign className="size-3.5" />
                </span>
                <span className="grid size-6 place-items-center rounded-full text-zinc-400">
                  <ImagePlus className="size-3.5" />
                </span>
              </div>
              <div className="px-1 py-1 text-[11px] text-zinc-600">Pide cualquier cosa…</div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 rounded-full bg-zinc-800/70 px-2.5 py-0.5 text-[10px] text-zinc-300">
                    Agent <ChevronDown className="size-2.5" />
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-zinc-800/70 px-2.5 py-0.5 text-[10px] text-zinc-300">
                    Auto <ChevronDown className="size-2.5" />
                  </span>
                </div>
                <span className="grid size-7 place-items-center rounded-full bg-white text-black">
                  <ArrowUp className="size-3.5" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Chat / diff focused mockup for the showcase section. */
function ChatShowcase() {
  return (
    <div className="space-y-2.5 p-4 text-xs">
      <div className="ml-auto max-w-[80%] rounded-lg rounded-br-sm bg-white px-3 py-2 text-black">
        Refactoriza esta función y añade manejo de errores.
      </div>
      <div className="max-w-[85%] rounded-lg rounded-bl-sm border border-zinc-800 bg-zinc-800/50 px-3 py-2 text-zinc-300">
        Hecho. Revisa el diff en{' '}
        <span className="font-medium text-zinc-200">api/client.ts</span>.
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/60 font-mono text-[11px]">
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-[10px] text-zinc-500">
          <span>api/client.ts</span>
          <span className="text-emerald-400">+18 −5</span>
        </div>
        <pre className="px-3 py-2 leading-relaxed">
          <div className="text-zinc-500"> async function fetchUser(id) {'{'}</div>
          <div className="text-rose-300/80">- return await api.get(id)</div>
          <div className="text-emerald-300/90">+ try {'{'}</div>
          <div className="text-emerald-300/90">+ return await api.get(id)</div>
          <div className="text-emerald-300/90">+ {'}'} catch (e) {'{'} log(e) {'}'}</div>
        </pre>
        <div className="flex gap-1.5 border-t border-zinc-800 px-3 py-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[10px] font-medium text-emerald-300">
            <Check className="size-3" /> Aceptar
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-[10px] font-medium text-zinc-400">
            <X className="size-3" /> Rechazar
          </span>
        </div>
      </div>
    </div>
  );
}

/** Web + mobile live preview mockup. */
function PreviewShowcase() {
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-md bg-zinc-300/15 px-2 py-1 text-[10px] font-medium text-zinc-200">
          <Monitor className="size-3" /> Web
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-[10px] font-medium text-zinc-400">
          <Smartphone className="size-3" /> Móvil
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400">
          <CircleDot className="size-2.5" /> En vivo
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="space-y-2 rounded-lg bg-gradient-to-b from-white/10 to-zinc-950 p-3">
          <div className="h-2 w-16 rounded-full bg-zinc-300/70" />
          <div className="h-5 w-3/4 rounded bg-zinc-100/90" />
          <div className="h-3 w-full rounded bg-zinc-100/40" />
          <div className="h-3 w-2/3 rounded bg-zinc-100/40" />
          <div className="mt-2 flex gap-2">
            <div className="h-6 w-20 rounded-md bg-zinc-300" />
            <div className="h-6 w-16 rounded-md bg-zinc-700" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="h-10 rounded-md bg-zinc-800/80" />
            <div className="h-10 rounded-md bg-zinc-800/80" />
            <div className="h-10 rounded-md bg-zinc-800/80" />
          </div>
        </div>
        <div className="w-20 rounded-[1rem] border-2 border-zinc-800 bg-zinc-900 p-1">
          <div className="mx-auto mb-1 h-1 w-6 rounded-full bg-zinc-700" />
          <div className="space-y-1 rounded-lg bg-gradient-to-b from-white/10 to-zinc-950 p-1.5">
            <div className="h-1.5 w-8 rounded-full bg-zinc-300/70" />
            <div className="h-2 w-full rounded bg-zinc-100/80" />
            <div className="h-2 w-2/3 rounded bg-zinc-100/40" />
            <div className="mt-1 h-3 w-10 rounded bg-zinc-300" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Domain manager mockup. */
function DomainsShowcase() {
  const domains = [
    { name: 'agentico.dev', provider: 'Hostinger', status: 'Activo' },
    { name: 'aurcode.app', provider: 'Namecheap', status: 'Activo' },
    { name: 'tu-proyecto.com', provider: 'GoDaddy', status: 'Propagando' },
  ];
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-1.5 text-xs text-zinc-400">
        <Globe className="size-3.5 text-zinc-300" />
        <span className="font-medium text-zinc-300">Dominios</span>
      </div>
      <ul className="space-y-2">
        {domains.map((d) => (
          <li
            key={d.name}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 text-xs"
          >
            <div>
              <p className="font-medium text-zinc-200">{d.name}</p>
              <p className="text-[10px] text-zinc-500">{d.provider}</p>
            </div>
            <span
              className={cx(
                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium',
                d.status === 'Activo'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-amber-500/15 text-amber-300',
              )}
            >
              <CircleDot className="size-2.5" />
              {d.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ShowcaseMockup({
  variant,
}: {
  variant: 'chat' | 'preview' | 'domains';
}) {
  const titles = {
    chat: 'AurCode — Chat de IA',
    preview: 'AurCode — Preview en vivo',
    domains: 'AurCode — Dominios',
  };
  return (
    <WindowChrome title={titles[variant]}>
      {variant === 'chat' && <ChatShowcase />}
      {variant === 'preview' && <PreviewShowcase />}
      {variant === 'domains' && <DomainsShowcase />}
    </WindowChrome>
  );
}

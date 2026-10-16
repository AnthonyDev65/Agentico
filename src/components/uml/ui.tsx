import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowUp01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

// Controles pequeños y oscuros para los editores visuales UML.

const field =
  "h-7 min-w-0 rounded-md border border-zinc-800 bg-[#121212] px-2 text-xs text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 hover:border-zinc-700 focus:border-indigo-500";

export function TextInput({
  value,
  onChange,
  placeholder,
  className,
  mono,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  mono?: boolean;
  title?: string;
}) {
  return (
    <input
      value={value}
      title={title}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(field, mono && "font-mono", className)}
    />
  );
}

// Input que solo confirma al salir o con Enter (para nombres que renombran referencias).
export function CommitInput({
  value,
  onCommit,
  placeholder,
  className,
  mono,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
  mono?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft.trim() && draft !== value) onCommit(draft.trim());
    else setDraft(value);
  };
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      className={cn(field, mono && "font-mono", className)}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  title,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  title?: string;
}) {
  return (
    <select
      value={value}
      title={title}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(field, "cursor-pointer pr-1", className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function IconBtn({
  icon,
  title,
  onClick,
  danger,
  disabled,
}: {
  icon: any;
  title: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors disabled:opacity-30",
        danger ? "hover:bg-red-500/10 hover:text-red-400" : "hover:bg-zinc-800 hover:text-zinc-200",
      )}
    >
      <HugeiconsIcon icon={icon} size={13} />
    </button>
  );
}

// Botones ↑ ↓ 🗑 de una fila (aparecen al pasar el ratón).
export function RowActions({
  index,
  count,
  onMove,
  onDelete,
}: {
  index: number;
  count: number;
  onMove: (to: number) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <IconBtn icon={ArrowUp01Icon} title="Subir" disabled={index === 0} onClick={() => onMove(index - 1)} />
      <IconBtn
        icon={ArrowDown01Icon}
        title="Bajar"
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
      />
      {onDelete ? (
        <IconBtn icon={Delete02Icon} title="Eliminar" danger onClick={onDelete} />
      ) : (
        <span className="size-6" />
      )}
    </div>
  );
}

export function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">{right}</div>
      </div>
      {children}
    </section>
  );
}

export function AddBtn({ icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-indigo-500/60 hover:bg-zinc-800"
    >
      <HugeiconsIcon icon={icon} size={12} />
      {label}
    </button>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-800 px-3 py-3 text-center text-[11px] text-zinc-600">
      {children}
    </div>
  );
}

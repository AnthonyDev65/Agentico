import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons";

function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delim) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.length ? rows : [[""]];
}

function serializeCsv(rows: string[][], delim: string): string {
  return rows
    .map((r) =>
      r
        .map((cell) =>
          cell.includes(delim) || cell.includes('"') || cell.includes("\n")
            ? '"' + cell.replace(/"/g, '""') + '"'
            : cell,
        )
        .join(delim),
    )
    .join("\n");
}

export default function CsvEditor({
  initialContent,
  name,
  onChange,
}: {
  initialContent: string;
  name: string;
  onChange: (content: string) => void;
}) {
  const delim = name.toLowerCase().endsWith(".tsv") ? "\t" : ",";
  const [rows, setRows] = useState<string[][]>([[""]]);
  const colsRef = useRef(1);

  useEffect(() => {
    const parsed = parseCsv(initialContent, delim);
    const cols = Math.max(1, ...parsed.map((r) => r.length));
    colsRef.current = cols;
    setRows(parsed.map((r) => [...r, ...Array(cols - r.length).fill("")]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (next: string[][]) => {
    setRows(next);
    onChange(serializeCsv(next, delim));
  };

  const setCell = (r: number, c: number, v: string) =>
    commit(rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row)));

  const addRow = () => commit([...rows, Array(colsRef.current).fill("")]);
  const delRow = (r: number) => commit(rows.length > 1 ? rows.filter((_, ri) => ri !== r) : rows);
  const addCol = () => {
    colsRef.current += 1;
    commit(rows.map((row) => [...row, ""]));
  };
  const delCol = (c: number) => {
    if (colsRef.current <= 1) return;
    colsRef.current -= 1;
    commit(rows.map((row) => row.filter((_, ci) => ci !== c)));
  };

  const cols = colsRef.current;
  const header = rows[0] ?? [];
  const body = rows.slice(1);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#121212]">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-3 text-xs text-zinc-400">
        <span className="font-medium text-zinc-200">
          {body.length} filas × {cols} columnas
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Add01Icon} size={13} /> Fila
          </button>
          <button
            type="button"
            onClick={addCol}
            className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Add01Icon} size={13} /> Columna
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-[#18181b]">
            <tr>
              <th className="w-8 border border-zinc-800 text-zinc-700">#</th>
              {header.map((cell, c) => (
                <th key={c} className="group min-w-[120px] border border-zinc-800 p-0">
                  <div className="flex items-center">
                    <input
                      value={cell}
                      onChange={(e) => setCell(0, c, e.target.value)}
                      placeholder={`Col ${c + 1}`}
                      spellCheck={false}
                      className="w-full bg-transparent px-2 py-1 font-mono font-semibold text-sky-300 outline-none focus:bg-[#1a1a1a]"
                    />
                    <button
                      type="button"
                      onClick={() => delCol(c)}
                      title="Eliminar columna"
                      className="mr-1 flex size-4 shrink-0 items-center justify-center rounded text-zinc-600 opacity-0 hover:text-red-400 group-hover:opacity-100"
                    >
                      <HugeiconsIcon icon={Delete01Icon} size={11} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} className="group">
                <td className="border border-zinc-800 bg-[#161616] text-center text-[10px] text-zinc-600">
                  <div className="flex items-center justify-center gap-0.5">
                    <span>{ri + 1}</span>
                    <button
                      type="button"
                      onClick={() => delRow(ri + 1)}
                      title="Eliminar fila"
                      className="flex size-3.5 items-center justify-center rounded text-zinc-700 opacity-0 hover:text-red-400 group-hover:opacity-100"
                    >
                      <HugeiconsIcon icon={Delete01Icon} size={10} />
                    </button>
                  </div>
                </td>
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c} className="border border-zinc-800 p-0">
                    <input
                      value={row[c] ?? ""}
                      onChange={(e) => setCell(ri + 1, c, e.target.value)}
                      spellCheck={false}
                      className="w-full bg-transparent px-2 py-1 font-mono text-zinc-200 outline-none focus:bg-[#1a1a1a]"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-3 text-[11px] text-zinc-600">Guarda con Ctrl + S.</div>
      </div>
    </div>
  );
}

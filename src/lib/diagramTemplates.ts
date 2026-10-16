// Plantillas Mermaid para insertar en .md (como bloque ```mermaid) o en .mmd.

export type DiagramTemplate = { key: string; label: string; code: string };

export const DIAGRAM_TEMPLATES: DiagramTemplate[] = [
  {
    key: "sequence",
    label: "Secuencia (UML)",
    code: `sequenceDiagram
    autonumber
    actor U as Usuario
    participant F as Frontend
    participant A as API
    participant DB as Base de datos

    U->>F: Inicia sesión
    F->>+A: POST /login
    A->>+DB: Buscar usuario
    DB-->>-A: Usuario
    alt credenciales válidas
        A-->>F: 200 + token
        F-->>U: Muestra el panel
    else inválidas
        A-->>-F: 401
        F-->>U: Muestra error
    end
    Note over F,A: El token se guarda en memoria`,
  },
  {
    key: "flow",
    label: "Flujo",
    code: `flowchart TD
    A[Inicio] --> B{¿Condición?}
    B -- Sí --> C[Acción]
    B -- No --> D[Otra acción]
    C --> E[Fin]
    D --> E`,
  },
  {
    key: "class",
    label: "Clases (UML)",
    code: `classDiagram
    class Usuario {
        +String id
        +String email
        +login() bool
    }
    class Pedido {
        +String id
        +Date fecha
        +total() float
    }
    Usuario "1" --> "*" Pedido : realiza`,
  },
  {
    key: "state",
    label: "Estados (UML)",
    code: `stateDiagram-v2
    [*] --> Pendiente
    Pendiente --> Pagado : pagar
    Pagado --> Enviado : enviar
    Enviado --> [*]
    Pendiente --> Cancelado : cancelar
    Cancelado --> [*]`,
  },
  {
    key: "er",
    label: "Entidad-Relación",
    code: `erDiagram
    USUARIO ||--o{ PEDIDO : realiza
    PEDIDO ||--|{ LINEA : contiene
    USUARIO {
        string id PK
        string email
    }
    PEDIDO {
        string id PK
        string usuario_id FK
        date fecha
    }`,
  },
];

// ── Detección de diagramas en Markdown ──

export type MdDiagram = { code: string; type: string };

const TYPE_NAMES: Record<string, string> = {
  sequenceDiagram: "secuencia",
  classDiagram: "clases",
  stateDiagram: "estados",
  "stateDiagram-v2": "estados",
  erDiagram: "er",
  flowchart: "flujo",
  graph: "flujo",
  gantt: "gantt",
  pie: "pie",
  mindmap: "mindmap",
  journey: "journey",
  gitGraph: "git",
  timeline: "timeline",
};

// Tipo de diagrama = primera palabra significativa (ignora %% comentarios/directivas).
export function diagramType(code: string) {
  const line = code
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("%%") && l !== "---");
  const word = line?.split(/\s+/)[0] ?? "";
  return TYPE_NAMES[word] ?? (word.replace(/[^\w-]/g, "").toLowerCase() || "diagrama");
}

// Bloques ```mermaid / ```mmd de un Markdown.
export function extractMermaidBlocks(md: string): MdDiagram[] {
  const out: MdDiagram[] = [];
  const re = /^[ \t]*(`{3,}|~{3,})[ \t]*(?:mermaid|mmd)\b[^\n]*\n([\s\S]*?)^[ \t]*\1[ \t]*$/gm;
  for (const m of md.matchAll(re)) {
    const code = m[2].replace(/\s+$/, "");
    if (code.trim()) out.push({ code, type: diagramType(code) });
  }
  return out;
}

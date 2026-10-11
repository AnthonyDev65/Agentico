import ReactDOM from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans";
import App from "./App";
import "./index.css";

// Quita el menú contextual del navegador, excepto en campos editables / editor /
// terminal (para conservar copiar/pegar nativo).
window.addEventListener("contextmenu", (e) => {
  const el = e.target as HTMLElement | null;
  if (!el?.closest("input, textarea, [contenteditable='true'], .cm-editor, .xterm")) {
    e.preventDefault();
  }
});

// Sin StrictMode: evita el doble-montaje en dev que dejaba la terminal "muerta".
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);

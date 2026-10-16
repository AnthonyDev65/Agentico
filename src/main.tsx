import ReactDOM from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans";
import App from "./App";
import "./index.css";

// Quita SIEMPRE el menú contextual nativo del webview (Emoji, Inspeccionar…).
// Las vistas que lo necesitan (terminal, editor, árbol) muestran uno propio;
// en los campos de texto siguen funcionando Ctrl+C / Ctrl+V / Ctrl+X.
window.addEventListener("contextmenu", (e) => e.preventDefault());

// Sin StrictMode: evita el doble-montaje en dev que dejaba la terminal "muerta".
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);

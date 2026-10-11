# Agentico — AurCode

IDE de escritorio potenciado por IA que **embebe el CLI de Claude** (usa tu propia
suscripción, no la API). Construido con **Tauri v2** (Rust) + **React + TypeScript + Vite**.

Incluye: árbol de archivos con multi-selección, editor (CodeMirror con autocompletado),
chat con Claude (streaming, parar, historial, retomar sesiones), terminal real (PTY),
preview web y móvil con consola, Git (diff aceptar/rechazar), gestor de dominios
(Hostinger / GoDaddy / Namecheap), servidores MCP, cliente API, gestor de puertos,
panel de uso de tokens, e instalación de dependencias en un clic.

## Requisitos

- **Node.js 18+** y **npm**
- **Rust** (stable) — https://rustup.rs
- **Claude CLI**: `npm install -g @anthropic-ai/claude-code` (luego ejecuta `claude` una vez para iniciar sesión)
- **pnpm**: `npm install -g pnpm`

> La app trae un asistente **"Requisitos del sistema"** (menú del logo, arriba a la
> izquierda) que detecta e instala Node / Claude / Git. En Windows usa `winget`,
> en macOS `brew`; en Linux te indica el comando de tu gestor de paquetes.

### Dependencias de sistema para Tauri

- **Windows**: Microsoft Visual Studio **Build Tools 2022** (workload "Desktop C++", para `msvcrt.lib`) + WebView2 (ya viene en Win10/11).
- **Linux (Debian/Ubuntu)**:
  ```bash
  sudo apt update
  sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev lsof
  ```
  (otras distros: ver https://tauri.app/start/prerequisites/)
- **macOS**: Xcode Command Line Tools.

## Desarrollo

```bash
pnpm install
pnpm tauri dev
```

En **Windows**, si usas los Build Tools 2022, puedes lanzar con el helper que carga
`vcvars64.bat`:

```bat
dev.cmd
```

## Compilar (instaladores)

```bash
pnpm tauri build
```

Genera los instaladores en `src-tauri/target/release/bundle/` (MSI/NSIS en Windows,
`.deb`/`.AppImage`/`.rpm` en Linux, `.dmg` en macOS).

## Estructura

- `src/` — frontend React (componentes del IDE)
- `src-tauri/src/lib.rs` — backend Rust (PTY, chat, fs, git, dominios, proxy, etc.)
- `Landing/landingAgentico/` — landing page (Astro + React)
- `brand/` — recursos de marca

## Notas multiplataforma

El código detecta el SO en backend (`cfg!`) y frontend (esquema del proxy) para
funcionar en Windows, Linux y macOS. En Linux, el gestor de puertos usa `lsof`.

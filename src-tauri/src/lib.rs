// Agentico IDE — backend Tauri.
// Maneja, POR ID DE PROYECTO, una terminal real (PTY) y una sesión de chat
// stream-json de `claude`. Así se puede trabajar en varios proyectos a la vez.
// Todo corre con la sesión de `claude /login` → usa tu SUSCRIPCIÓN, no la API.

use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

use base64::Engine;
use portable_pty::{CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};

// ───────────────────────── Payloads de eventos ─────────────────────────

#[derive(Clone, Serialize)]
struct PtyData {
    id: String,
    chunk: String, // bytes en base64
}

#[derive(Clone, Serialize)]
struct IdPayload {
    id: String,
}

#[derive(Clone, Serialize)]
struct ChatLine {
    id: String,
    line: String,
}

// ───────────────────────── Terminal (PTY) ─────────────────────────

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[derive(Default)]
struct PtyState {
    sessions: Mutex<HashMap<String, PtySession>>,
}

/// Arranca `claude` interactivo dentro de un PTY para la sesión `id`.
#[tauri::command]
fn pty_spawn(
    app: tauri::AppHandle,
    state: State<'_, PtyState>,
    id: String,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
    kind: Option<String>,
) -> Result<(), String> {
    let pty_system = portable_pty::native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // kind: "claude" (CLI de claude) o "shell" (terminal del sistema).
    let kind = kind.unwrap_or_else(|| "claude".to_string());
    let mut cmd = if kind == "shell" {
        if cfg!(windows) {
            CommandBuilder::new("powershell.exe")
        } else {
            CommandBuilder::new(std::env::var("SHELL").unwrap_or_else(|_| "bash".to_string()))
        }
    } else if cfg!(windows) {
        // En Windows `claude` es un shim (.cmd); lo lanzamos via cmd.exe /c.
        let mut c = CommandBuilder::new("cmd.exe");
        c.args(["/c", "claude"]);
        c
    } else {
        CommandBuilder::new("claude")
    };
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    state.sessions.lock().unwrap().insert(
        id.clone(),
        PtySession {
            master: pair.master,
            writer,
            child,
        },
    );

    let app_handle = app.clone();
    let reader_id = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                    let _ = app_handle.emit(
                        "pty://data",
                        PtyData {
                            id: reader_id.clone(),
                            chunk,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        let _ = app_handle.emit("pty://exit", IdPayload { id: reader_id });
    });

    Ok(())
}

#[tauri::command]
fn pty_write(state: State<'_, PtyState>, id: String, data: String) -> Result<(), String> {
    let mut guard = state.sessions.lock().unwrap();
    if let Some(s) = guard.get_mut(&id) {
        s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        s.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn pty_resize(state: State<'_, PtyState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let guard = state.sessions.lock().unwrap();
    if let Some(s) = guard.get(&id) {
        s.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn pty_kill(state: State<'_, PtyState>, id: String) {
    if let Some(mut s) = state.sessions.lock().unwrap().remove(&id) {
        let _ = s.child.kill();
    }
}

// ───────────────────────── Chat (stream-json) ─────────────────────────

struct ChatSession {
    stdin: ChildStdin,
    child: Child,
}

#[derive(Default)]
struct ChatState {
    sessions: Mutex<HashMap<String, ChatSession>>,
}

/// Arranca (o reinicia) la sesión de chat `id`.
/// `permission_mode`: default | acceptEdits | plan | bypassPermissions.
/// `model`: alias (opus/sonnet/haiku) o None para el modelo por defecto.
#[tauri::command]
fn chat_start(
    app: tauri::AppHandle,
    state: State<'_, ChatState>,
    id: String,
    cwd: Option<String>,
    permission_mode: Option<String>,
    model: Option<String>,
    resume: Option<String>,
) -> Result<(), String> {
    // Si ya había una sesión con este id, la matamos antes de abrir la nueva.
    if let Some(mut old) = state.sessions.lock().unwrap().remove(&id) {
        let _ = old.child.kill();
        let _ = old.child.wait();
    }

    let perm = permission_mode.unwrap_or_else(|| "acceptEdits".to_string());
    let mut args: Vec<String> = vec![
        "-p".into(),
        "--input-format".into(),
        "stream-json".into(),
        "--output-format".into(),
        "stream-json".into(),
        "--include-partial-messages".into(),
        "--verbose".into(),
        "--permission-mode".into(),
        perm,
    ];
    if let Some(r) = resume {
        if !r.is_empty() {
            args.push("--resume".into());
            args.push(r);
        }
    }
    if let Some(m) = model {
        if !m.is_empty() && m != "auto" {
            args.push("--model".into());
            args.push(m);
        }
    }

    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd.exe");
        c.arg("/c").arg("claude").args(&args);
        c
    } else {
        let mut c = Command::new("claude");
        c.args(&args);
        c
    };
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("sin stdout")?;
    let stderr = child.stderr.take().ok_or("sin stderr")?;
    let stdin = child.stdin.take().ok_or("sin stdin")?;

    // Lector de stdout: una línea JSON por evento.
    let app_out = app.clone();
    let out_id = id.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) if !l.trim().is_empty() => {
                    let _ = app_out.emit(
                        "chat://event",
                        ChatLine {
                            id: out_id.clone(),
                            line: l,
                        },
                    );
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
        let _ = app_out.emit("chat://exit", IdPayload { id: out_id });
    });

    // Lector de stderr.
    let app_err = app.clone();
    let err_id = id.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            let _ = app_err.emit(
                "chat://stderr",
                ChatLine {
                    id: err_id.clone(),
                    line,
                },
            );
        }
    });

    state
        .sessions
        .lock()
        .unwrap()
        .insert(id, ChatSession { stdin, child });

    Ok(())
}

#[derive(Deserialize)]
struct ImageInput {
    media_type: String,
    data: String, // base64
}

#[tauri::command]
fn chat_send(
    state: State<'_, ChatState>,
    id: String,
    text: String,
    images: Option<Vec<ImageInput>>,
) -> Result<(), String> {
    let mut content: Vec<serde_json::Value> = Vec::new();
    if let Some(imgs) = images {
        for img in imgs {
            content.push(serde_json::json!({
                "type": "image",
                "source": { "type": "base64", "media_type": img.media_type, "data": img.data }
            }));
        }
    }
    if !text.is_empty() {
        content.push(serde_json::json!({ "type": "text", "text": text }));
    }

    let msg = serde_json::json!({
        "type": "user",
        "message": { "role": "user", "content": content }
    });
    let line = format!("{}\n", msg);

    let mut guard = state.sessions.lock().unwrap();
    let s = guard.get_mut(&id).ok_or("la sesión de chat no está iniciada")?;
    s.stdin.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    s.stdin.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
struct ImageData {
    media_type: String,
    data: String,
}

/// Lee una imagen del disco y la devuelve en base64 + media type.
#[tauri::command]
fn read_image(path: String) -> Result<ImageData, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase());
    let media_type = match ext.as_deref() {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        Some("avif") => "image/avif",
        _ => return Err("formato de imagen no soportado".into()),
    };
    let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(ImageData {
        media_type: media_type.to_string(),
        data,
    })
}

#[tauri::command]
fn chat_kill(state: State<'_, ChatState>, id: String) {
    if let Some(mut s) = state.sessions.lock().unwrap().remove(&id) {
        let _ = s.child.kill();
        let _ = s.child.wait();
    }
}

// ───────────────────────── Proyectos (persistencia) ─────────────────────────

#[derive(Serialize, Deserialize, Clone)]
struct Project {
    path: String,
    name: String,
}

#[derive(Serialize, Deserialize, Default)]
struct Workspace {
    projects: Vec<Project>,
    active: Option<String>,
}

fn workspace_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("projects.json"))
}

#[tauri::command]
fn projects_load(app: tauri::AppHandle) -> Result<Workspace, String> {
    let file = workspace_file(&app)?;
    match std::fs::read_to_string(&file) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        Err(_) => Ok(Workspace::default()),
    }
}

#[tauri::command]
fn projects_save(app: tauri::AppHandle, workspace: Workspace) -> Result<(), String> {
    let file = workspace_file(&app)?;
    let json = serde_json::to_string_pretty(&workspace).map_err(|e| e.to_string())?;
    std::fs::write(&file, json).map_err(|e| e.to_string())
}

// ───────────────────────── Hostinger (dominios) ─────────────────────────
// Proxy HTTP hacia la API de Hostinger (https://developers.hostinger.com).
// Se hace desde el backend para evitar CORS y mantener el token fuera del
// webview. El token se guarda en el directorio de config de la app.

fn hostinger_token_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("hostinger.json"))
}

#[derive(Serialize, Deserialize, Default)]
struct HostingerToken {
    token: String,
}

fn read_hostinger_token(app: &tauri::AppHandle) -> Option<String> {
    let file = hostinger_token_file(app).ok()?;
    let s = std::fs::read_to_string(file).ok()?;
    let t: HostingerToken = serde_json::from_str(&s).ok()?;
    let t = t.token.trim().to_string();
    if t.is_empty() {
        None
    } else {
        Some(t)
    }
}

#[tauri::command]
fn hostinger_token_get(app: tauri::AppHandle) -> Option<String> {
    read_hostinger_token(&app)
}

#[tauri::command]
fn hostinger_token_set(app: tauri::AppHandle, token: String) -> Result<(), String> {
    let file = hostinger_token_file(&app)?;
    let json = serde_json::to_string(&HostingerToken { token }).map_err(|e| e.to_string())?;
    std::fs::write(&file, json).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct HostingerResp {
    status: u16,
    body: serde_json::Value,
}

#[tauri::command]
async fn hostinger_request(
    app: tauri::AppHandle,
    method: String,
    path: String,
    body: Option<serde_json::Value>,
) -> Result<HostingerResp, String> {
    let token = read_hostinger_token(&app)
        .ok_or_else(|| "No hay token de Hostinger configurado".to_string())?;
    let m = reqwest::Method::from_bytes(method.to_uppercase().as_bytes())
        .map_err(|_| "Método HTTP inválido".to_string())?;
    let url = format!("https://developers.hostinger.com{}", path);
    let client = reqwest::Client::new();
    let mut req = client
        .request(m, &url)
        .bearer_auth(token)
        .header("Accept", "application/json");
    if let Some(b) = body {
        req = req.json(&b);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let json =
        serde_json::from_str::<serde_json::Value>(&text).unwrap_or(serde_json::Value::String(text));
    Ok(HostingerResp { status, body: json })
}

// ──────────────── Dominios multi-proveedor (Hostinger/GoDaddy/Namecheap) ───────────────
// Credenciales por proveedor en domain_providers.json. domain_request hace de
// proxy aplicando la autenticación propia de cada API.

fn providers_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("domain_providers.json"))
}

fn read_providers(app: &tauri::AppHandle) -> serde_json::Value {
    let file = match providers_file(app) {
        Ok(f) => f,
        Err(_) => return serde_json::json!({}),
    };
    std::fs::read_to_string(file)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

fn provider_creds(app: &tauri::AppHandle, provider: &str) -> Option<serde_json::Value> {
    let p = read_providers(app);
    if let Some(v) = p.get(provider) {
        if v.is_object() {
            return Some(v.clone());
        }
    }
    // Compatibilidad: si Hostinger ya tenía token en el archivo antiguo.
    if provider == "hostinger" {
        if let Some(t) = read_hostinger_token(app) {
            return Some(serde_json::json!({ "token": t }));
        }
    }
    None
}

#[tauri::command]
fn domain_creds_get(app: tauri::AppHandle) -> serde_json::Value {
    let p = read_providers(&app);
    let has = |k: &str| p.get(k).map(|v| v.is_object()).unwrap_or(false);
    serde_json::json!({
        "hostinger": has("hostinger") || read_hostinger_token(&app).is_some(),
        "godaddy": has("godaddy"),
        "namecheap": has("namecheap"),
    })
}

#[tauri::command]
fn domain_creds_set(
    app: tauri::AppHandle,
    provider: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let mut p = read_providers(&app);
    if !p.is_object() {
        p = serde_json::json!({});
    }
    p[provider] = value;
    let json = serde_json::to_string_pretty(&p).map_err(|e| e.to_string())?;
    std::fs::write(providers_file(&app)?, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn domain_creds_clear(app: tauri::AppHandle, provider: String) -> Result<(), String> {
    let mut p = read_providers(&app);
    if let Some(obj) = p.as_object_mut() {
        obj.remove(&provider);
    }
    let json = serde_json::to_string_pretty(&p).map_err(|e| e.to_string())?;
    std::fs::write(providers_file(&app)?, json).map_err(|e| e.to_string())
}

#[tauri::command]
async fn domain_request(
    app: tauri::AppHandle,
    provider: String,
    method: String,
    path: String,
    body: Option<serde_json::Value>,
) -> Result<HostingerResp, String> {
    let creds = provider_creds(&app, &provider)
        .ok_or_else(|| format!("El proveedor '{}' no tiene credenciales", provider))?;
    let get = |k: &str| creds.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();

    let m = reqwest::Method::from_bytes(method.to_uppercase().as_bytes())
        .map_err(|_| "Método HTTP inválido".to_string())?;
    let client = reqwest::Client::new();

    let mut req = match provider.as_str() {
        "hostinger" => {
            let url = format!("https://developers.hostinger.com{}", path);
            client.request(m, &url).bearer_auth(get("token")).header("Accept", "application/json")
        }
        "godaddy" => {
            let url = format!("https://api.godaddy.com{}", path);
            client
                .request(m, &url)
                .header("Authorization", format!("sso-key {}:{}", get("key"), get("secret")))
                .header("Accept", "application/json")
        }
        "namecheap" => {
            // `path` trae Command y parámetros extra; aquí se añade la auth.
            let sep = if path.contains('?') { "&" } else { "?" };
            let user = get("api_user");
            let username = if get("username").is_empty() { user.clone() } else { get("username") };
            let url = format!(
                "https://api.namecheap.com/xml.response{}{}ApiUser={}&ApiKey={}&UserName={}&ClientIp={}",
                path,
                sep,
                urlenc(&user),
                urlenc(&get("api_key")),
                urlenc(&username),
                urlenc(&get("client_ip")),
            );
            client.request(m, &url)
        }
        _ => return Err(format!("Proveedor no soportado: {}", provider)),
    };

    if let Some(b) = body {
        req = req.json(&b);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let json =
        serde_json::from_str::<serde_json::Value>(&text).unwrap_or(serde_json::Value::String(text));
    Ok(HostingerResp { status, body: json })
}

/// Codificación mínima de parámetros de URL (para los query de Namecheap).
fn urlenc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

// ───────────────────────── Cliente HTTP (API tester) ─────────────────────────

#[derive(Serialize)]
struct HttpResult {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
    body: String,
    time_ms: u64,
    size: u64,
}

#[tauri::command]
async fn http_request(
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
) -> Result<HttpResult, String> {
    let m = reqwest::Method::from_bytes(method.to_uppercase().as_bytes())
        .map_err(|_| "Método HTTP inválido".to_string())?;
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.request(m, &url);
    for (k, v) in &headers {
        if !k.trim().is_empty() {
            req = req.header(k, v);
        }
    }
    if let Some(b) = body {
        if !b.is_empty() {
            req = req.body(b);
        }
    }
    let start = std::time::Instant::now();
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let hdrs: Vec<(String, String)> = resp
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let size = bytes.len() as u64;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    Ok(HttpResult {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers: hdrs,
        body: text,
        time_ms: start.elapsed().as_millis() as u64,
        size,
    })
}

/// Busca un icono dentro del proyecto y lo devuelve como data URL (o None).
#[tauri::command]
fn project_icon(path: String) -> Option<String> {
    let candidates = [
        "favicon.ico",
        "public/favicon.ico",
        "public/favicon.png",
        "public/favicon.svg",
        "public/logo.png",
        "public/logo.svg",
        "public/apple-touch-icon.png",
        "src/favicon.ico",
        "app/favicon.ico",
        "app/icon.png",
        "app/icon.svg",
        "static/favicon.ico",
        "static/favicon.png",
        "assets/favicon.ico",
        "assets/icon.png",
        "icon.png",
        "logo.png",
        "src-tauri/icons/icon.png",
    ];
    let base = std::path::Path::new(&path);
    for rel in candidates {
        let full = base.join(rel);
        if let Ok(bytes) = std::fs::read(&full) {
            if bytes.is_empty() {
                continue;
            }
            let mime = match full.extension().and_then(|e| e.to_str()) {
                Some("ico") => "image/x-icon",
                Some("png") => "image/png",
                Some("svg") => "image/svg+xml",
                Some("jpg") | Some("jpeg") => "image/jpeg",
                Some("webp") => "image/webp",
                _ => "application/octet-stream",
            };
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            return Some(format!("data:{};base64,{}", mime, b64));
        }
    }
    None
}

// ───────────────────────── package.json (comandos) ─────────────────────────

#[derive(Serialize)]
struct PackageInfo {
    has_package: bool,
    installed: bool, // existe node_modules
    manager: String, // npm | pnpm | yarn | bun
    dev_script: Option<String>,
    build_script: Option<String>,
    scripts: Vec<String>,
    port: Option<u16>,
}

fn detect_port(dev_cmd: &str, pkg: &serde_json::Value) -> Option<u16> {
    // 1) buscar puerto explícito en el script dev.
    let tokens: Vec<&str> = dev_cmd.split_whitespace().collect();
    for (i, t) in tokens.iter().enumerate() {
        if let Some(rest) = t.strip_prefix("--port=") {
            if let Ok(p) = rest.parse::<u16>() {
                return Some(p);
            }
        }
        if let Some(rest) = t.strip_prefix("PORT=") {
            if let Ok(p) = rest.parse::<u16>() {
                return Some(p);
            }
        }
        if (*t == "--port" || *t == "-p") && i + 1 < tokens.len() {
            if let Ok(p) = tokens[i + 1].parse::<u16>() {
                return Some(p);
            }
        }
    }
    // 2) adivinar por dependencias.
    let has = |name: &str| {
        pkg.get("dependencies").and_then(|d| d.get(name)).is_some()
            || pkg.get("devDependencies").and_then(|d| d.get(name)).is_some()
    };
    if has("next") || has("nuxt") {
        return Some(3000);
    }
    if has("react-scripts") {
        return Some(3000);
    }
    if has("@vue/cli-service") {
        return Some(8080);
    }
    if has("@angular/cli") {
        return Some(4200);
    }
    if has("astro") {
        return Some(4321);
    }
    if has("gatsby") {
        return Some(8000);
    }
    Some(5173) // vite y por defecto
}

/// Lee package.json del proyecto e identifica gestor de paquetes, scripts
/// dev/build y el puerto probable del servidor de desarrollo.
#[tauri::command]
fn package_info(path: String) -> PackageInfo {
    let base = std::path::Path::new(&path);
    let content = match std::fs::read_to_string(base.join("package.json")) {
        Ok(c) => c,
        Err(_) => {
            return PackageInfo {
                has_package: false,
                installed: false,
                manager: "npm".into(),
                dev_script: None,
                build_script: None,
                scripts: vec![],
                port: None,
            }
        }
    };
    let v: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::Value::Null);
    let scripts_obj = v.get("scripts").and_then(|s| s.as_object());
    let scripts: Vec<String> = scripts_obj
        .map(|o| o.keys().cloned().collect())
        .unwrap_or_default();

    let pick = |cands: &[&str]| {
        cands
            .iter()
            .find(|c| scripts.iter().any(|s| s == *c))
            .map(|c| c.to_string())
    };
    let dev_script = pick(&["dev", "start", "serve", "develop"]);
    let build_script = pick(&["build", "dist", "compile", "build:prod"]);

    let manager = if base.join("pnpm-lock.yaml").exists() {
        "pnpm"
    } else if base.join("yarn.lock").exists() {
        "yarn"
    } else if base.join("bun.lockb").exists() {
        "bun"
    } else {
        "npm"
    }
    .to_string();

    let dev_cmd = dev_script
        .as_ref()
        .and_then(|name| scripts_obj.and_then(|o| o.get(name)))
        .and_then(|x| x.as_str())
        .unwrap_or("");
    let port = detect_port(dev_cmd, &v);

    PackageInfo {
        has_package: true,
        installed: base.join("node_modules").is_dir(),
        manager,
        dev_script,
        build_script,
        scripts,
        port,
    }
}

// ───────────────────────── Filesystem (editor + árbol) ─────────────────────────

#[derive(Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

/// Lista una carpeta (no recursivo): carpetas primero, luego archivos, alfabético.
#[tauri::command]
fn fs_list(path: String) -> Result<Vec<DirEntry>, String> {
    let mut out: Vec<DirEntry> = Vec::new();
    for entry in std::fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        out.push(DirEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
        });
    }
    out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(out)
}

/// Lee un archivo de texto (UTF-8). Falla si es binario / no-UTF8.
#[tauri::command]
fn fs_read(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

fn walk_files(base: &Path, dir: &Path, ignore: &[&str], out: &mut Vec<String>, depth: u32) {
    if depth > 12 || out.len() > 5000 {
        return;
    }
    let rd = match std::fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return,
    };
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_dir {
            if ignore.contains(&name.as_str()) {
                continue;
            }
            walk_files(base, &entry.path(), ignore, out, depth + 1);
        } else if let Ok(rel) = entry.path().strip_prefix(base) {
            out.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
}

/// Lista (recursivo) todos los archivos del proyecto como rutas relativas,
/// ignorando carpetas pesadas. Para el selector de @menciones.
#[tauri::command]
fn fs_list_all(path: String) -> Vec<String> {
    let base = Path::new(&path);
    let ignore = [
        "node_modules",
        ".git",
        "dist",
        "build",
        "target",
        ".next",
        ".cache",
        "out",
        ".turbo",
        ".svelte-kit",
        ".vite",
        ".output",
        "coverage",
    ];
    let mut out = Vec::new();
    walk_files(base, base, &ignore, &mut out, 0);
    out.sort();
    out
}

/// Guarda contenido en un archivo.
#[tauri::command]
fn fs_write(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn fs_create_file(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("ya existe un archivo con ese nombre".into());
    }
    std::fs::write(&path, "").map_err(|e| e.to_string())
}

#[tauri::command]
fn fs_create_dir(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("ya existe una carpeta con ese nombre".into());
    }
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn fs_delete(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn fs_rename(from: String, to: String) -> Result<(), String> {
    if Path::new(&to).exists() {
        return Err("el destino ya existe".into());
    }
    std::fs::rename(&from, &to).map_err(|e| e.to_string())
}

// ───────────────────────── Estilos para el preview ─────────────────────────

#[derive(Serialize)]
struct PreviewStyles {
    uses_tailwind: bool,
    css: String,
}

/// Busca el CSS de entrada del proyecto y detecta si usa Tailwind, para
/// inyectarlo en el preview de componentes.
#[tauri::command]
fn preview_styles(project_path: String) -> PreviewStyles {
    let base = Path::new(&project_path);
    let candidates = [
        "src/index.css",
        "src/main.css",
        "src/App.css",
        "src/app.css",
        "src/styles.css",
        "src/style.css",
        "src/global.css",
        "src/globals.css",
        "src/index.scss",
        "src/styles/globals.css",
        "src/styles/index.css",
        "src/styles/tailwind.css",
        "src/tailwind.css",
        "src/assets/index.css",
        "styles/globals.css",
        "app/globals.css",
        "app/global.css",
        "index.css",
        "styles.css",
        "global.css",
    ];
    let mut found: Vec<String> = Vec::new();
    let mut tailwind_entry: Option<String> = None;
    for rel in candidates {
        if let Ok(c) = std::fs::read_to_string(base.join(rel)) {
            let is_tw = c.contains("@import \"tailwindcss\"")
                || c.contains("@import 'tailwindcss'")
                || c.contains("@tailwind ");
            if is_tw && tailwind_entry.is_none() {
                tailwind_entry = Some(c.clone());
            }
            found.push(c);
        }
    }
    let dep_tw = std::fs::read_to_string(base.join("package.json"))
        .ok()
        .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
        .map(|v| {
            let has = |k: &str| v.get(k).and_then(|d| d.get("tailwindcss")).is_some();
            has("dependencies") || has("devDependencies")
        })
        .unwrap_or(false);

    let uses_tailwind = tailwind_entry.is_some() || dep_tw;
    let css = if let Some(tw) = tailwind_entry {
        tw
    } else if uses_tailwind {
        format!("@import \"tailwindcss\";\n{}", found.join("\n"))
    } else {
        found.join("\n")
    };

    PreviewStyles { uses_tailwind, css }
}

// ───────────────────────── Git ─────────────────────────

fn run_git(path: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(path)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0") // no pedir credenciales (fallar en vez de colgar)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).to_string();
        Err(if err.trim().is_empty() {
            String::from_utf8_lossy(&out.stdout).to_string()
        } else {
            err
        })
    }
}

#[derive(Serialize)]
struct GitFile {
    path: String,
    x: String, // estado en el índice (staged)
    y: String, // estado en el working tree
}

#[derive(Serialize)]
struct GitStatus {
    is_repo: bool,
    branch: Option<String>,
    ahead: u32,
    behind: u32,
    files: Vec<GitFile>,
}

#[tauri::command]
fn git_status(path: String) -> GitStatus {
    let out = match run_git(&path, &["status", "--porcelain=v1", "-b"]) {
        Ok(o) => o,
        Err(_) => {
            return GitStatus {
                is_repo: false,
                branch: None,
                ahead: 0,
                behind: 0,
                files: vec![],
            }
        }
    };
    let mut branch = None;
    let mut ahead = 0;
    let mut behind = 0;
    let mut files = Vec::new();
    for line in out.lines() {
        if let Some(rest) = line.strip_prefix("## ") {
            branch = Some(rest.split("...").next().unwrap_or(rest).trim().to_string());
            if let Some(b) = rest.find('[') {
                let seg = &rest[b + 1..rest.len().saturating_sub(1)];
                for p in seg.split(',') {
                    let p = p.trim();
                    if let Some(n) = p.strip_prefix("ahead ") {
                        ahead = n.trim().parse().unwrap_or(0);
                    }
                    if let Some(n) = p.strip_prefix("behind ") {
                        behind = n.trim().parse().unwrap_or(0);
                    }
                }
            }
        } else if line.len() >= 4 {
            let x = line[0..1].to_string();
            let y = line[1..2].to_string();
            let mut p = line[3..].to_string();
            if let Some(idx) = p.find(" -> ") {
                p = p[idx + 4..].to_string();
            }
            files.push(GitFile { path: p, x, y });
        }
    }
    GitStatus {
        is_repo: true,
        branch,
        ahead,
        behind,
        files,
    }
}

#[tauri::command]
fn git_diff(path: String, file: String, staged: bool) -> Result<String, String> {
    let mut args: Vec<&str> = vec!["diff"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(&file);
    run_git(&path, &args)
}

#[tauri::command]
fn git_stage(path: String, file: String) -> Result<String, String> {
    run_git(&path, &["add", "--", &file])
}

#[tauri::command]
fn git_unstage(path: String, file: String) -> Result<String, String> {
    run_git(&path, &["restore", "--staged", "--", &file])
}

#[tauri::command]
fn git_stage_all(path: String) -> Result<String, String> {
    run_git(&path, &["add", "-A"])
}

#[tauri::command]
fn git_unstage_all(path: String) -> Result<String, String> {
    run_git(&path, &["reset"])
}

/// Descarta los cambios de un archivo (rechazar edición). Si no está rastreado,
/// lo elimina; si sí, revierte índice y árbol de trabajo a HEAD.
#[tauri::command]
fn git_discard(path: String, file: String, untracked: bool) -> Result<String, String> {
    if untracked {
        let full = std::path::Path::new(&path).join(&file);
        if full.is_dir() {
            std::fs::remove_dir_all(&full).map_err(|e| e.to_string())?;
        } else {
            std::fs::remove_file(&full).map_err(|e| e.to_string())?;
        }
        Ok(format!("Descartado (eliminado) {}", file))
    } else {
        run_git(&path, &["checkout", "HEAD", "--", &file])
    }
}

/// Descarta TODOS los cambios: vuelve a HEAD y borra archivos nuevos (respeta
/// .gitignore). Operación destructiva: confirmar en la UI.
#[tauri::command]
fn git_discard_all(path: String) -> Result<String, String> {
    run_git(&path, &["reset", "--hard", "HEAD"])?;
    run_git(&path, &["clean", "-fd"])
}

#[tauri::command]
fn git_commit(path: String, message: String) -> Result<String, String> {
    run_git(&path, &["commit", "-m", &message])
}

#[tauri::command]
fn git_push(path: String) -> Result<String, String> {
    run_git(&path, &["push"])
}

#[tauri::command]
fn git_pull(path: String) -> Result<String, String> {
    run_git(&path, &["pull"])
}

// ───────────────────────── Skills ─────────────────────────

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

/// Carpeta `.claude` según el ámbito.
fn scope_base(scope: &str, project_path: &str) -> Option<PathBuf> {
    if scope == "project" {
        Some(Path::new(project_path).join(".claude"))
    } else {
        home_dir().map(|h| h.join(".claude"))
    }
}

/// Lee `name` y `description` del frontmatter de SKILL.md.
fn parse_skill_md(dir: &Path) -> (Option<String>, Option<String>) {
    let content = match std::fs::read_to_string(dir.join("SKILL.md")) {
        Ok(c) => c,
        Err(_) => return (None, None),
    };
    let mut name = None;
    let mut desc = None;
    let mut lines = content.lines();
    if lines.next().map(|l| l.trim()) == Some("---") {
        for line in lines {
            let t = line.trim();
            if t == "---" {
                break;
            }
            if let Some(v) = t.strip_prefix("name:") {
                if name.is_none() {
                    name = Some(v.trim().trim_matches(['"', '\'']).to_string());
                }
            } else if let Some(v) = t.strip_prefix("description:") {
                if desc.is_none() {
                    desc = Some(v.trim().trim_matches(['"', '\'']).to_string());
                }
            }
        }
    }
    (name, desc)
}

fn copy_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            if entry.file_name() == ".git" {
                continue; // no copiamos el historial git
            }
            copy_dir(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

#[derive(Serialize)]
struct Skill {
    name: String,
    description: String,
    path: String,
    scope: String,
    enabled: bool,
}

fn scan_scope(base: &Path, scope: &str, out: &mut Vec<Skill>) {
    for (dirname, enabled) in [("skills", true), ("skills-disabled", false)] {
        if let Ok(rd) = std::fs::read_dir(base.join(dirname)) {
            for entry in rd.flatten() {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    let p = entry.path();
                    if !p.join("SKILL.md").exists() {
                        continue;
                    }
                    let (name, desc) = parse_skill_md(&p);
                    out.push(Skill {
                        name: name.unwrap_or_else(|| {
                            entry.file_name().to_string_lossy().to_string()
                        }),
                        description: desc.unwrap_or_default(),
                        path: p.to_string_lossy().to_string(),
                        scope: scope.to_string(),
                        enabled,
                    });
                }
            }
        }
    }
}

#[tauri::command]
fn skills_list(project_path: String) -> Vec<Skill> {
    let mut out = Vec::new();
    if let Some(home) = home_dir() {
        scan_scope(&home.join(".claude"), "user", &mut out);
    }
    scan_scope(&Path::new(&project_path).join(".claude"), "project", &mut out);
    out
}

#[tauri::command]
fn skills_delete(path: String) -> Result<(), String> {
    if !path.contains("skills") {
        return Err("ruta no válida".into());
    }
    std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn skills_set_enabled(path: String, enabled: bool) -> Result<String, String> {
    let p = Path::new(&path);
    let name = p.file_name().ok_or("ruta inválida")?.to_os_string();
    let base = p.parent().and_then(|x| x.parent()).ok_or("ruta inválida")?;
    let target_dir = base.join(if enabled { "skills" } else { "skills-disabled" });
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    let target = target_dir.join(&name);
    std::fs::rename(p, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn skill_install_local(src: String, scope: String, project_path: String) -> Result<(), String> {
    let src_path = Path::new(&src);
    if !src_path.join("SKILL.md").exists() {
        return Err("la carpeta no contiene SKILL.md".into());
    }
    let base = scope_base(&scope, &project_path).ok_or("no se pudo resolver la carpeta de skills")?;
    let name = src_path
        .file_name()
        .ok_or("ruta inválida")?
        .to_string_lossy()
        .to_string();
    let dest = base.join("skills").join(&name);
    copy_dir(src_path, &dest).map_err(|e| e.to_string())
}

#[tauri::command]
fn skill_install_git(url: String, scope: String, project_path: String) -> Result<(), String> {
    let base = scope_base(&scope, &project_path).ok_or("no se pudo resolver la carpeta de skills")?;
    let skills_dir = base.join("skills");
    std::fs::create_dir_all(&skills_dir).map_err(|e| e.to_string())?;
    let repo = url
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("skill")
        .trim_end_matches(".git")
        .to_string();
    run_git(
        skills_dir.to_string_lossy().as_ref(),
        &["clone", "--depth", "1", &url, &repo],
    )?;
    // Quitamos el .git para que quede como un skill limpio.
    let _ = std::fs::remove_dir_all(skills_dir.join(&repo).join(".git"));
    Ok(())
}

#[tauri::command]
fn skill_create(name: String, scope: String, project_path: String) -> Result<(), String> {
    let base = scope_base(&scope, &project_path).ok_or("no se pudo resolver la carpeta de skills")?;
    let dir = base.join("skills").join(&name);
    if dir.exists() {
        return Err("ya existe un skill con ese nombre".into());
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let template = format!(
        "---\nname: {name}\ndescription: Describe aquí cuándo debe usarse este skill.\n---\n\n# {name}\n\nInstrucciones del skill…\n"
    );
    std::fs::write(dir.join("SKILL.md"), template).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct MarketSkill {
    name: String,
    description: String,
    path: String,
}

fn collect_market_skills(dir: &Path, depth: u32, out: &mut Vec<MarketSkill>) {
    if depth > 3 {
        return;
    }
    if dir.join("SKILL.md").exists() {
        let (name, desc) = parse_skill_md(dir);
        out.push(MarketSkill {
            name: name.unwrap_or_else(|| {
                dir.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default()
            }),
            description: desc.unwrap_or_default(),
            path: dir.to_string_lossy().to_string(),
        });
        return; // no recursamos dentro de un skill
    }
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            if e.file_type().map(|t| t.is_dir()).unwrap_or(false) && e.file_name() != ".git" {
                collect_market_skills(&e.path(), depth + 1, out);
            }
        }
    }
}

/// Clona/actualiza un repo "marketplace" y lista los skills que contiene.
#[tauri::command]
fn marketplace_browse(url: String) -> Result<Vec<MarketSkill>, String> {
    let home = home_dir().ok_or("no se encontró HOME")?;
    let cache = home.join(".claude").join(".agentico-market");
    std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    let repo = url
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("market")
        .trim_end_matches(".git")
        .to_string();
    let dir = cache.join(&repo);
    if dir.join(".git").exists() {
        let _ = run_git(dir.to_string_lossy().as_ref(), &["pull", "--ff-only"]);
    } else {
        run_git(
            cache.to_string_lossy().as_ref(),
            &["clone", "--depth", "1", &url, &repo],
        )?;
    }
    let mut out = Vec::new();
    collect_market_skills(&dir, 0, &mut out);
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

// ───────────────────────── Librerías (dependencias) ─────────────────────────

fn detect_pm(path: &str) -> String {
    let base = Path::new(path);
    if base.join("pnpm-lock.yaml").exists() {
        "pnpm"
    } else if base.join("yarn.lock").exists() {
        "yarn"
    } else if base.join("bun.lockb").exists() {
        "bun"
    } else {
        "npm"
    }
    .to_string()
}

/// Ejecuta un comando (en Windows via cmd.exe /c para resolver shims .cmd).
fn run_cmd(cwd: &str, program: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd.exe");
        c.arg("/c").arg(program).args(args);
        c
    } else {
        let mut c = Command::new(program);
        c.args(args);
        c
    };
    cmd.current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    if out.status.success() {
        Ok(combined)
    } else {
        Err(if combined.trim().is_empty() {
            "el comando falló".into()
        } else {
            combined
        })
    }
}

#[derive(Clone, Serialize)]
struct CreateLog {
    id: String,
    line: String,
}

/// Como run_cmd, pero transmite cada línea (stdout + stderr) por el evento
/// `create://log` para dar feedback en vivo al crear/clonar proyectos.
fn run_cmd_streamed(
    app: &tauri::AppHandle,
    id: &str,
    cwd: &str,
    program: &str,
    args: &[&str],
) -> Result<(), String> {
    let _ = app.emit(
        "create://log",
        CreateLog {
            id: id.to_string(),
            line: format!("$ {} {}", program, args.join(" ")),
        },
    );
    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd.exe");
        c.arg("/c").arg(program).args(args);
        c
    } else {
        let mut c = Command::new(program);
        c.args(args);
        c
    };
    cmd.current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app1 = app.clone();
    let id1 = id.to_string();
    let h1 = stdout.map(|out| {
        std::thread::spawn(move || {
            for line in BufReader::new(out).lines().flatten() {
                let _ = app1.emit("create://log", CreateLog { id: id1.clone(), line });
            }
        })
    });
    let app2 = app.clone();
    let id2 = id.to_string();
    let h2 = stderr.map(|err| {
        std::thread::spawn(move || {
            for line in BufReader::new(err).lines().flatten() {
                let _ = app2.emit("create://log", CreateLog { id: id2.clone(), line });
            }
        })
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    if let Some(h) = h1 {
        let _ = h.join();
    }
    if let Some(h) = h2 {
        let _ = h.join();
    }
    if status.success() {
        Ok(())
    } else {
        Err("el comando falló".into())
    }
}

fn add_args(manager: &str, name: &str, dev: bool) -> Vec<String> {
    let (verb, dev_flag) = match manager {
        "npm" => ("install", "--save-dev"),
        "yarn" => ("add", "--dev"),
        "bun" => ("add", "-d"),
        _ => ("add", "-D"), // pnpm
    };
    let mut a = vec![verb.to_string()];
    if dev {
        a.push(dev_flag.to_string());
    }
    a.push(name.to_string());
    a
}

fn remove_args(manager: &str, name: &str) -> Vec<String> {
    let verb = if manager == "npm" { "uninstall" } else { "remove" };
    vec![verb.to_string(), name.to_string()]
}

#[derive(Serialize)]
struct Lib {
    name: String,
    range: String,
    dev: bool,
    installed: Option<String>,
}

#[derive(Serialize)]
struct Libraries {
    manager: String,
    libs: Vec<Lib>,
}

#[tauri::command]
fn libraries_list(project_path: String) -> Libraries {
    let base = Path::new(&project_path);
    let manager = detect_pm(&project_path);
    let mut libs = Vec::new();
    if let Ok(content) = std::fs::read_to_string(base.join("package.json")) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
            for (key, dev) in [("dependencies", false), ("devDependencies", true)] {
                if let Some(obj) = v.get(key).and_then(|x| x.as_object()) {
                    for (name, range) in obj {
                        let installed = std::fs::read_to_string(
                            base.join("node_modules").join(name).join("package.json"),
                        )
                        .ok()
                        .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
                        .and_then(|p| {
                            p.get("version").and_then(|x| x.as_str()).map(String::from)
                        });
                        libs.push(Lib {
                            name: name.clone(),
                            range: range.as_str().unwrap_or("").to_string(),
                            dev,
                            installed,
                        });
                    }
                }
            }
        }
    }
    libs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Libraries { manager, libs }
}

#[tauri::command]
fn library_add(project_path: String, name: String, dev: bool) -> Result<String, String> {
    let manager = detect_pm(&project_path);
    let args = add_args(&manager, &name, dev);
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run_cmd(&project_path, &manager, &refs)
}

#[tauri::command]
fn library_remove(project_path: String, name: String) -> Result<String, String> {
    let manager = detect_pm(&project_path);
    let args = remove_args(&manager, &name);
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run_cmd(&project_path, &manager, &refs)
}

// ───────────────────────── Crear / clonar proyectos ─────────────────────────

/// Crea un proyecto nuevo con el scaffolder del framework elegido.
/// `preset`: vite-<template> (react-ts, vue-ts, svelte-ts, solid-ts, preact-ts,
/// lit-ts, vanilla-ts, react, vue, …), "next" o "astro".
/// Añade una línea de import al principio de un archivo de config.
fn prepend_line(src: &str, line: &str) -> String {
    format!("{}\n{}", line, src)
}

/// Configura Tailwind v4 en un proyecto Vite (plugin + @import en el CSS).
fn wire_tailwind_vite(proj: &Path) {
    for cfg in ["vite.config.ts", "vite.config.js", "vite.config.mjs"] {
        let p = proj.join(cfg);
        if let Ok(mut c) = std::fs::read_to_string(&p) {
            if !c.contains("@tailwindcss/vite") {
                c = prepend_line(&c, "import tailwindcss from \"@tailwindcss/vite\";");
                c = c.replacen("plugins: [", "plugins: [tailwindcss(), ", 1);
                let _ = std::fs::write(&p, c);
            }
            break;
        }
    }
    for css in ["src/index.css", "src/style.css", "src/app.css", "src/main.css", "src/styles.css"] {
        let p = proj.join(css);
        if let Ok(c) = std::fs::read_to_string(&p) {
            if !c.contains("@import \"tailwindcss\"") && !c.contains("@tailwind ") {
                let _ = std::fs::write(&p, format!("@import \"tailwindcss\";\n{}", c));
            }
            break;
        }
    }
}

#[tauri::command]
fn create_project(
    app: tauri::AppHandle,
    id: String,
    parent_dir: String,
    name: String,
    preset: String,
    libs: Option<Vec<String>>,
) -> Result<String, String> {
    if name.trim().is_empty() || name.contains(['/', '\\', ' ']) {
        return Err("nombre inválido (sin espacios ni / \\)".into());
    }
    let proj = Path::new(&parent_dir).join(&name);
    if proj.exists() {
        return Err("ya existe una carpeta con ese nombre".into());
    }

    let mut libs = libs.unwrap_or_default();
    let wants_tailwind = libs.iter().any(|l| l == "tailwindcss");
    let is_vite = preset.starts_with("vite-");

    let mut install_after = false;
    let args: Vec<String> = if let Some(tpl) = preset.strip_prefix("vite-") {
        install_after = true;
        vec![
            "create".into(),
            "vite@latest".into(),
            name.clone(),
            "--".into(),
            "--template".into(),
            tpl.to_string(),
        ]
    } else if preset == "next" {
        let tw = if wants_tailwind { "--tailwind" } else { "--no-tailwind" };
        vec![
            "create".into(),
            "next-app@latest".into(),
            name.clone(),
            "--".into(),
            "--ts".into(),
            "--eslint".into(),
            "--app".into(),
            "--no-src-dir".into(),
            tw.into(),
            "--no-turbopack".into(),
            "--import-alias".into(),
            "@/*".into(),
            "--use-npm".into(),
            "--yes".into(),
        ]
    } else if preset == "astro" {
        vec![
            "create".into(),
            "astro@latest".into(),
            name.clone(),
            "--".into(),
            "--template".into(),
            "basics".into(),
            "--install".into(),
            "--no-git".into(),
            "--yes".into(),
            "--skip-houston".into(),
        ]
    } else {
        return Err("framework no soportado".into());
    };

    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run_cmd_streamed(&app, &id, &parent_dir, "npm", &refs)?;

    let proj_str = proj.to_string_lossy().to_string();
    if install_after {
        let _ = run_cmd_streamed(&app, &id, &proj_str, "npm", &["install"]);
    }

    // Tailwind en Vite: añadimos el plugin y configuramos.
    if wants_tailwind && is_vite && !libs.iter().any(|l| l == "@tailwindcss/vite") {
        libs.push("@tailwindcss/vite".into());
    }
    // En Next, Tailwind ya lo configura create-next-app → no reinstalar el paquete.
    let to_install: Vec<String> = if preset == "next" {
        libs.iter().filter(|l| *l != "tailwindcss").cloned().collect()
    } else {
        libs.clone()
    };
    if !to_install.is_empty() {
        let mut a = vec!["install".to_string()];
        a.extend(to_install);
        let refs: Vec<&str> = a.iter().map(String::as_str).collect();
        let _ = run_cmd_streamed(&app, &id, &proj_str, "npm", &refs);
    }
    if wants_tailwind && is_vite {
        wire_tailwind_vite(&proj);
    }

    let _ = app.emit(
        "create://log",
        CreateLog {
            id: id.clone(),
            line: "✓ Proyecto listo".into(),
        },
    );
    Ok(proj_str)
}

/// Clona un repositorio git dentro de `parent_dir` y devuelve la ruta del proyecto.
#[tauri::command]
fn clone_repo(
    app: tauri::AppHandle,
    id: String,
    url: String,
    parent_dir: String,
) -> Result<String, String> {
    let name = url
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("repo")
        .trim_end_matches(".git")
        .to_string();
    run_cmd_streamed(&app, &id, &parent_dir, "git", &["clone", "--progress", &url, &name])?;
    let _ = app.emit(
        "create://log",
        CreateLog {
            id: id.clone(),
            line: "✓ Repositorio clonado".into(),
        },
    );
    Ok(Path::new(&parent_dir).join(&name).to_string_lossy().to_string())
}

// ───────────────────────── Gestor de puertos ─────────────────────────

#[derive(Serialize)]
struct PortProc {
    port: u16,
    pid: u32,
    name: String,
}

/// Lista los puertos TCP en escucha con su proceso (PID + nombre).
#[tauri::command]
fn list_ports() -> Vec<PortProc> {
    let mut out = Vec::new();

    if cfg!(windows) {
        // Mapa PID -> nombre de proceso.
        let mut names: HashMap<u32, String> = HashMap::new();
        if let Ok(tl) = run_cmd(".", "tasklist", &["/NH", "/FO", "CSV"]) {
            for line in tl.lines() {
                let fields: Vec<String> = line
                    .split("\",\"")
                    .map(|s| s.trim_matches('"').trim().to_string())
                    .collect();
                if fields.len() >= 2 {
                    if let Ok(pid) = fields[1].parse::<u32>() {
                        names.insert(pid, fields[0].clone());
                    }
                }
            }
        }
        if let Ok(ns) = run_cmd(".", "netstat", &["-ano", "-p", "TCP"]) {
            let mut seen: HashSet<(u16, u32)> = HashSet::new();
            for line in ns.lines() {
                let t: Vec<&str> = line.split_whitespace().collect();
                if t.len() >= 5 && t[0] == "TCP" && t[3] == "LISTENING" {
                    let port = t[1].rsplit(':').next().and_then(|p| p.parse::<u16>().ok());
                    let pid = t[4].parse::<u32>().ok();
                    if let (Some(port), Some(pid)) = (port, pid) {
                        if pid != 0 && seen.insert((port, pid)) {
                            let name = names.get(&pid).cloned().unwrap_or_else(|| "?".into());
                            out.push(PortProc { port, pid, name });
                        }
                    }
                }
            }
        }
    } else if let Ok(ls) = run_cmd(".", "lsof", &["-iTCP", "-sTCP:LISTEN", "-P", "-n"]) {
        let mut seen: HashSet<(u16, u32)> = HashSet::new();
        for line in ls.lines().skip(1) {
            let t: Vec<&str> = line.split_whitespace().collect();
            if t.len() >= 9 {
                let pid = t[1].parse::<u32>().ok();
                let port = t[8].rsplit(':').next().and_then(|p| p.parse::<u16>().ok());
                if let (Some(pid), Some(port)) = (pid, port) {
                    if seen.insert((port, pid)) {
                        out.push(PortProc { port, pid, name: t[0].to_string() });
                    }
                }
            }
        }
    }

    out.sort_by_key(|p| p.port);
    out
}

/// Mata un proceso por PID (cierra el puerto que ocupa).
#[tauri::command]
fn kill_process(pid: u32) -> Result<String, String> {
    let p = pid.to_string();
    if cfg!(windows) {
        run_cmd(".", "taskkill", &["/PID", &p, "/F"])
    } else {
        run_cmd(".", "kill", &["-9", &p])
    }
}

// ───────────────── Historial de conversaciones de claude ─────────────────
// claude guarda cada sesión como JSONL en ~/.claude/projects/<ruta-codificada>/.
// La ruta del proyecto se codifica cambiando cada carácter no alfanumérico por '-'.

fn encode_project(path: &str) -> String {
    path.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

fn claude_sessions_dir(project_path: &str) -> Option<PathBuf> {
    home_dir().map(|h| {
        h.join(".claude")
            .join("projects")
            .join(encode_project(project_path))
    })
}

fn truncate_str(s: &str, max: usize) -> String {
    let s = s.trim().replace('\n', " ");
    if s.chars().count() > max {
        format!("{}…", s.chars().take(max).collect::<String>())
    } else {
        s
    }
}

fn value_text(content: &serde_json::Value) -> String {
    if let Some(s) = content.as_str() {
        return s.to_string();
    }
    if let Some(arr) = content.as_array() {
        return arr
            .iter()
            .filter_map(|b| {
                if b.get("type").and_then(|t| t.as_str()) == Some("text") {
                    b.get("text").and_then(|t| t.as_str()).map(|s| s.to_string())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join(" ");
    }
    String::new()
}

fn session_title(path: &Path) -> String {
    use std::io::BufRead;
    if let Ok(f) = std::fs::File::open(path) {
        let reader = std::io::BufReader::new(f);
        for (i, line) in reader.lines().enumerate() {
            if i > 60 {
                break;
            }
            let line = match line {
                Ok(l) => l,
                Err(_) => break,
            };
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
                let t = v.get("type").and_then(|x| x.as_str()).unwrap_or("");
                if t == "summary" {
                    if let Some(s) = v.get("summary").and_then(|x| x.as_str()) {
                        return truncate_str(s, 90);
                    }
                }
                if t == "user" {
                    let txt = v
                        .get("message")
                        .and_then(|m| m.get("content"))
                        .map(value_text)
                        .unwrap_or_default();
                    if !txt.trim().is_empty() && !txt.starts_with("Trabaja sobre estos archivos") {
                        return truncate_str(&txt, 90);
                    }
                }
            }
        }
    }
    "(sin título)".to_string()
}

#[derive(Serialize)]
struct SessionMeta {
    id: String,
    file: String,
    modified: u64,
    size: u64,
    title: String,
}

#[tauri::command]
fn chat_sessions(project_path: String) -> Vec<SessionMeta> {
    let dir = match claude_sessions_dir(&project_path) {
        Some(d) => d,
        None => return vec![],
    };
    let mut out = vec![];
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) != Some("jsonl") {
                continue;
            }
            let meta = e.metadata().ok();
            let modified = meta
                .as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let id = p
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let title = session_title(&p);
            out.push(SessionMeta {
                id,
                file: p.to_string_lossy().to_string(),
                modified,
                size,
                title,
            });
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out
}

#[tauri::command]
fn chat_session_read(file: String) -> Result<String, String> {
    std::fs::read_to_string(&file).map_err(|e| e.to_string())
}

// ───────────────── Proxy del dev server (esquema agproxy) ─────────────────
// Reenvía las peticiones del iframe de la vista móvil al dev server local,
// añadiendo cabeceras CORS (para que el JS de la página pueda ejecutarse aunque
// Vite bloquee orígenes cruzados) e inyectando un script que, tras renderizar,
// reporta el color de fondo real al contenedor padre vía postMessage.

struct ProxyPort(std::sync::Arc<std::sync::Mutex<u16>>);

#[tauri::command]
fn set_proxy_port(state: State<ProxyPort>, port: u16) {
    if let Ok(mut g) = state.0.lock() {
        *g = port;
    }
}

const BG_PROBE_SCRIPT: &str = r#"<script>(function(){function post(o){try{parent.postMessage(o,"*")}catch(e){}}["log","info","warn","error","debug"].forEach(function(lv){var orig=console[lv];console[lv]=function(){try{var a=Array.prototype.slice.call(arguments).map(function(x){if(typeof x==="string")return x;try{return JSON.stringify(x)}catch(e){return String(x)}});post({__agconsole:{level:lv,text:a.join(" ")}})}catch(e){}return orig.apply(console,arguments)}});window.addEventListener("error",function(e){post({__agconsole:{level:"error",text:(e.message||"Error")+(e.filename?(" ("+e.filename+":"+e.lineno+")"):"")}})});window.addEventListener("unhandledrejection",function(e){var r=e.reason;post({__agconsole:{level:"error",text:"Unhandled rejection: "+((r&&r.message)||r||"")}})});function op(c){return c&&c!=="transparent"&&c!=="rgba(0, 0, 0, 0)"&&!/,\s*0\)\s*$/.test(c)}function sendBg(){try{var b=getComputedStyle(document.body).backgroundColor;var h=getComputedStyle(document.documentElement).backgroundColor;var c=op(b)?b:(op(h)?h:"");if(c)post({__agproxyBg:c})}catch(e){}}var n=0,id=setInterval(function(){sendBg();if(++n>15)clearInterval(id)},350);window.addEventListener("load",sendBg)})();</script>"#;

async fn proxy_fetch(
    port: u16,
    method: &str,
    path_q: &str,
    body: Vec<u8>,
) -> tauri::http::Response<std::borrow::Cow<'static, [u8]>> {
    let err = |code: u16, msg: String| {
        tauri::http::Response::builder()
            .status(code)
            .header("Access-Control-Allow-Origin", "*")
            .header("Content-Type", "text/plain; charset=utf-8")
            .body(std::borrow::Cow::Owned(msg.into_bytes()))
            .unwrap()
    };
    if port == 0 {
        return err(503, "proxy port no configurado".into());
    }
    let url = format!("http://127.0.0.1:{}{}", port, path_q);
    let m = reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::GET);
    let client = reqwest::Client::new();
    let mut rb = client.request(m, &url);
    if !body.is_empty() {
        rb = rb.body(body);
    }
    match rb.send().await {
        Ok(r) => {
            let status = r.status().as_u16();
            let ct = r
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("application/octet-stream")
                .to_string();
            let raw = r.bytes().await.map(|b| b.to_vec()).unwrap_or_default();
            let out: Vec<u8> = if ct.contains("text/html") {
                let mut html = String::from_utf8_lossy(&raw).into_owned();
                match html.rfind("</body>") {
                    Some(idx) => html.insert_str(idx, BG_PROBE_SCRIPT),
                    None => html.push_str(BG_PROBE_SCRIPT),
                }
                html.into_bytes()
            } else {
                raw
            };
            tauri::http::Response::builder()
                .status(status)
                .header("Content-Type", ct)
                .header("Access-Control-Allow-Origin", "*")
                .header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
                .header("Access-Control-Allow-Headers", "*")
                .body(std::borrow::Cow::Owned(out))
                .unwrap()
        }
        Err(e) => err(502, format!("proxy error: {}", e)),
    }
}

// ───────────────────────── Arranque ─────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let proxy_port = std::sync::Arc::new(std::sync::Mutex::new(0u16));
    let proxy_for_scheme = proxy_port.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ProxyPort(proxy_port.clone()))
        .register_asynchronous_uri_scheme_protocol("agproxy", move |_ctx, request, responder| {
            let port = proxy_for_scheme.lock().map(|g| *g).unwrap_or(0);
            let method = request.method().as_str().to_string();
            let path_q = request
                .uri()
                .path_and_query()
                .map(|p| p.as_str().to_string())
                .unwrap_or_else(|| "/".to_string());
            let body = request.body().clone();
            tauri::async_runtime::spawn(async move {
                let resp = proxy_fetch(port, &method, &path_q, body).await;
                responder.respond(resp);
            });
        })
        .setup(|app| {
            app.manage(PtyState::default());
            app.manage(ChatState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            chat_start,
            chat_send,
            chat_kill,
            projects_load,
            projects_save,
            project_icon,
            package_info,
            fs_list,
            fs_list_all,
            fs_read,
            fs_write,
            fs_create_file,
            fs_create_dir,
            fs_delete,
            fs_rename,
            read_image,
            git_status,
            git_diff,
            git_stage,
            git_unstage,
            git_stage_all,
            git_unstage_all,
            git_discard,
            git_discard_all,
            git_commit,
            git_push,
            git_pull,
            skills_list,
            skills_delete,
            skills_set_enabled,
            skill_install_local,
            skill_install_git,
            skill_create,
            marketplace_browse,
            libraries_list,
            library_add,
            library_remove,
            preview_styles,
            create_project,
            clone_repo,
            list_ports,
            kill_process,
            hostinger_token_get,
            hostinger_token_set,
            hostinger_request,
            domain_creds_get,
            domain_creds_set,
            domain_creds_clear,
            domain_request,
            chat_sessions,
            chat_session_read,
            http_request,
            set_proxy_port
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

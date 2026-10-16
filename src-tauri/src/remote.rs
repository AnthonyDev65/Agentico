// Control remoto del chat desde el teléfono.
//
// Servidor HTTP propio (hyper) que sirve una web móvil del chat:
//   GET  /             → página (remote.html); `?t=<token>` deja una cookie y ya no hace falta
//   GET  /api/state    → proyectos + última instantánea de cada chat
//   GET  /api/poll     → long polling `?v=<versión>&p=<proyecto>`: responde al haber cambios
//                        (o a los 25 s). NO SSE: el túnel rápido de Cloudflare retiene las
//                        respuestas en streaming hasta que terminan.
//   POST /api/action   → acción del teléfono → evento Tauri `remote://action` {id, action}
// El estado del chat sigue viviendo en el ChatView (React): éste publica instantáneas con
// `remote_publish` y ejecuta las acciones que llegan, así la cola, los permisos y las
// preguntas funcionan igual que en el PC.
//
// Acceso: TODO pide el token (32 bytes aleatorios, persistido en remote.json). Por defecto
// solo escucha en 127.0.0.1 (lo publica el túnel de Cloudflare); con `lan` escucha en
// 0.0.0.0 (red local / Tailscale).

use std::collections::HashMap;
use std::convert::Infallible;
use std::io::{BufRead, BufReader};
use std::net::SocketAddr;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

use bytes::Bytes;
use http_body_util::{combinators::BoxBody, BodyExt, Full};
use hyper::body::Incoming;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{broadcast, watch};

const PAGE: &str = include_str!("remote.html");
const DEFAULT_PORT: u16 = 8787;

#[derive(Serialize, Deserialize, Clone, Default)]
struct Config {
    token: String,
    port: u16,
    lan: bool,
}

#[derive(Default)]
struct Shared {
    projects: serde_json::Value,
    snapshots: HashMap<String, serde_json::Value>,
    /// Sube con cada cambio: el teléfono pregunta «¿hay algo después de la versión N?».
    version: u64,
}

pub struct RemoteState {
    shared: Arc<Mutex<Shared>>,
    tx: broadcast::Sender<String>,
    server: Mutex<Option<(watch::Sender<bool>, u16, bool)>>,
    tunnel: Arc<Mutex<Option<Child>>>,
    tunnel_url: Arc<Mutex<Option<String>>>,
}

impl Default for RemoteState {
    fn default() -> Self {
        let (tx, _) = broadcast::channel(256);
        Self {
            shared: Default::default(),
            tx,
            server: Mutex::new(None),
            tunnel: Default::default(),
            tunnel_url: Default::default(),
        }
    }
}

fn config_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("remote.json"))
}

fn new_token() -> Result<String, String> {
    let mut b = [0u8; 32];
    getrandom::getrandom(&mut b).map_err(|e| e.to_string())?;
    Ok(b.iter().map(|x| format!("{:02x}", x)).collect())
}

fn load_config(app: &AppHandle) -> Result<Config, String> {
    let p = config_path(app)?;
    let mut c: Config = std::fs::read_to_string(&p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    if c.token.len() < 32 {
        c.token = new_token()?;
    }
    if c.port == 0 {
        c.port = DEFAULT_PORT;
    }
    save_config(app, &c)?;
    Ok(c)
}

fn save_config(app: &AppHandle, c: &Config) -> Result<(), String> {
    let p = config_path(app)?;
    std::fs::write(p, serde_json::to_string_pretty(c).unwrap_or_default()).map_err(|e| e.to_string())
}

// Comparación en tiempo constante (no filtra cuántos caracteres coinciden).
fn same(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn query_param(q: &str, key: &str) -> Option<String> {
    q.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key).then(|| v.to_string())
    })
}

fn cookie(req: &Request<Incoming>, key: &str) -> Option<String> {
    let raw = req.headers().get(hyper::header::COOKIE)?.to_str().ok()?;
    raw.split(';').find_map(|kv| {
        let (k, v) = kv.trim().split_once('=')?;
        (k == key).then(|| v.to_string())
    })
}

type Body = BoxBody<Bytes, Infallible>;

fn full(s: impl Into<Bytes>) -> Body {
    Full::new(s.into()).boxed()
}

fn resp(status: StatusCode, ctype: &str, body: Body) -> Response<Body> {
    Response::builder()
        .status(status)
        .header("Content-Type", ctype)
        .header("Cache-Control", "no-store")
        .header("X-Frame-Options", "DENY")
        .header("Referrer-Policy", "no-referrer")
        .header("X-Content-Type-Options", "nosniff")
        .body(body)
        .unwrap()
}

const DENIED: &str = "<!doctype html><meta name=viewport content='width=device-width'><body style='background:#121212;color:#a1a1aa;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;text-align:center'><div><b style='color:#fafafa'>Agentico · Control remoto</b><p>Enlace no válido o caducado.<br>Escanea de nuevo el QR desde Agentico.</p></div>";

fn state_json(shared: &Arc<Mutex<Shared>>) -> String {
    let g = shared.lock().unwrap();
    serde_json::json!({ "type": "state", "version": g.version, "projects": g.projects, "snapshots": g.snapshots })
        .to_string()
}

// Respuesta del poll: lista de proyectos, qué chats están ocupados y la instantánea
// SOLO del proyecto que mira el teléfono (las demás no viajan).
fn poll_json(shared: &Arc<Mutex<Shared>>, pid: &str) -> String {
    let g = shared.lock().unwrap();
    let busy: serde_json::Map<String, serde_json::Value> = g
        .snapshots
        .iter()
        .map(|(k, v)| (k.clone(), v.get("busy").cloned().unwrap_or(serde_json::Value::Bool(false))))
        .collect();
    serde_json::json!({
        "version": g.version,
        "projects": g.projects,
        "busy": busy,
        "pid": pid,
        "snapshot": g.snapshots.get(pid),
    })
    .to_string()
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < b.len() => {
                match u8::from_str_radix(std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or(""), 16) {
                    Ok(x) => {
                        out.push(x);
                        i += 2;
                    }
                    Err(_) => out.push(b'%'),
                }
            }
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

type OnAction = Arc<dyn Fn(serde_json::Value) + Send + Sync>;

async fn handle(
    req: Request<Incoming>,
    on_action: OnAction,
    token: Arc<String>,
    shared: Arc<Mutex<Shared>>,
    tx: broadcast::Sender<String>,
    shutdown: watch::Receiver<bool>,
) -> Result<Response<Body>, Infallible> {
    let path = req.uri().path().to_string();
    let q = req.uri().query().unwrap_or("").to_string();
    let via_query = query_param(&q, "t").map(|t| same(&t, &token)).unwrap_or(false);
    let ok = via_query
        || cookie(&req, "agt").map(|t| same(&t, &token)).unwrap_or(false)
        || req
            .headers()
            .get("x-agentico-token")
            .and_then(|v| v.to_str().ok())
            .map(|t| same(t, &token))
            .unwrap_or(false);

    if !ok {
        return Ok(if path == "/" {
            resp(StatusCode::UNAUTHORIZED, "text/html; charset=utf-8", full(DENIED))
        } else {
            resp(StatusCode::UNAUTHORIZED, "application/json", full("{\"error\":\"unauthorized\"}"))
        });
    }

    match (req.method(), path.as_str()) {
        (&Method::GET, "/") => {
            let mut r = resp(StatusCode::OK, "text/html; charset=utf-8", full(PAGE));
            if via_query {
                let c = format!("agt={}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000", token);
                r.headers_mut().insert(hyper::header::SET_COOKIE, c.parse().unwrap());
            }
            Ok(r)
        }
        (&Method::GET, "/manifest.webmanifest") => Ok(resp(
            StatusCode::OK,
            "application/manifest+json",
            full(r##"{"name":"Agentico","short_name":"Agentico","display":"standalone","background_color":"#121212","theme_color":"#121212","start_url":"/"}"##),
        )),
        (&Method::GET, "/api/state") => Ok(resp(StatusCode::OK, "application/json", full(state_json(&shared)))),
        (&Method::GET, "/api/poll") => {
            // Long polling (los túneles rápidos de Cloudflare retienen las respuestas SSE
            // hasta que terminan → no sirven). `v` = última versión vista: si no hay nada
            // nuevo se espera hasta 25 s a un cambio. `p` = proyecto que se está viendo.
            let since = query_param(&q, "v").and_then(|v| v.parse::<u64>().ok());
            let pid = query_param(&q, "p").map(|p| percent_decode(&p)).unwrap_or_default();
            // Suscribirse ANTES de mirar la versión: así no se pierde un cambio intermedio.
            let mut rx = tx.subscribe();
            let current = shared.lock().unwrap().version;
            if since == Some(current) {
                let mut down = shutdown.clone();
                tokio::select! {
                    _ = rx.recv() => {},
                    _ = tokio::time::sleep(std::time::Duration::from_secs(25)) => {},
                    _ = down.changed() => {},
                }
            }
            Ok(resp(StatusCode::OK, "application/json", full(poll_json(&shared, &pid))))
        }
        (&Method::POST, "/api/action") => {
            let body = match req.into_body().collect().await {
                Ok(b) => b.to_bytes(),
                Err(_) => return Ok(resp(StatusCode::BAD_REQUEST, "application/json", full("{}"))),
            };
            if body.len() > 256 * 1024 {
                return Ok(resp(StatusCode::PAYLOAD_TOO_LARGE, "application/json", full("{}")));
            }
            match serde_json::from_slice::<serde_json::Value>(&body) {
                Ok(v) if v.get("id").and_then(|x| x.as_str()).is_some() && v.get("action").is_some() => {
                    on_action(v);
                    Ok(resp(StatusCode::OK, "application/json", full("{\"ok\":true}")))
                }
                _ => Ok(resp(StatusCode::BAD_REQUEST, "application/json", full("{\"error\":\"bad action\"}"))),
            }
        }
        _ => Ok(resp(StatusCode::NOT_FOUND, "application/json", full("{}"))),
    }
}

async fn serve(
    listener: tokio::net::TcpListener,
    token: Arc<String>,
    shared: Arc<Mutex<Shared>>,
    tx: broadcast::Sender<String>,
    down_rx: watch::Receiver<bool>,
    on_action: OnAction,
) {
    let mut down = down_rx.clone();
    loop {
        let (stream, _) = tokio::select! {
            r = listener.accept() => match r { Ok(x) => x, Err(_) => continue },
            _ = down.changed() => break,
        };
        let (on_action, token, shared, tx, down_rx) =
            (on_action.clone(), token.clone(), shared.clone(), tx.clone(), down_rx.clone());
        tokio::spawn(async move {
            let svc = hyper::service::service_fn(move |req| {
                handle(req, on_action.clone(), token.clone(), shared.clone(), tx.clone(), down_rx.clone())
            });
            let _ = hyper::server::conn::http1::Builder::new()
                .serve_connection(TokioIo::new(stream), svc)
                .await;
        });
    }
}

#[derive(Serialize)]
pub struct RemoteStatus {
    running: bool,
    port: u16,
    lan: bool,
    token: String,
    lan_ip: Option<String>,
    tunnel_running: bool,
    tunnel_url: Option<String>,
    cloudflared: Option<String>,
}

// IP local principal (no envía paquetes: solo pregunta a la tabla de rutas).
fn local_ip() -> Option<String> {
    let s = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("8.8.8.8:80").ok()?;
    Some(s.local_addr().ok()?.ip().to_string())
}

fn find_cloudflared() -> Option<String> {
    let exe = if cfg!(windows) { "cloudflared.exe" } else { "cloudflared" };
    if let Some(paths) = std::env::var_os("PATH") {
        for d in std::env::split_paths(&paths) {
            let p = d.join(exe);
            if p.is_file() {
                return Some(p.to_string_lossy().to_string());
            }
        }
    }
    // winget lo instala aquí; el PATH de este proceso no se refresca hasta reiniciar.
    let mut cands: Vec<std::path::PathBuf> = vec![];
    for var in ["ProgramFiles(x86)", "ProgramFiles"] {
        if let Some(v) = std::env::var_os(var) {
            cands.push(std::path::PathBuf::from(v).join("cloudflared").join(exe));
        }
    }
    if let Some(v) = std::env::var_os("LOCALAPPDATA") {
        let links = std::path::PathBuf::from(v).join("Microsoft").join("WinGet").join("Links").join(exe);
        cands.push(links);
    }
    cands.into_iter().find(|p| p.is_file()).map(|p| p.to_string_lossy().to_string())
}

fn status_of(app: &AppHandle, st: &RemoteState) -> Result<RemoteStatus, String> {
    let cfg = load_config(app)?;
    let server = st.server.lock().unwrap();
    let tunnel_running = {
        let mut t = st.tunnel.lock().unwrap();
        match t.as_mut() {
            Some(c) => matches!(c.try_wait(), Ok(None)),
            None => false,
        }
    };
    Ok(RemoteStatus {
        running: server.is_some(),
        port: server.as_ref().map(|s| s.1).unwrap_or(cfg.port),
        lan: server.as_ref().map(|s| s.2).unwrap_or(cfg.lan),
        token: cfg.token,
        lan_ip: local_ip(),
        tunnel_running,
        tunnel_url: if tunnel_running { st.tunnel_url.lock().unwrap().clone() } else { None },
        cloudflared: find_cloudflared(),
    })
}

#[tauri::command]
pub fn remote_status(app: AppHandle, st: State<'_, RemoteState>) -> Result<RemoteStatus, String> {
    status_of(&app, &st)
}

#[tauri::command]
pub async fn remote_start(
    app: AppHandle,
    st: State<'_, RemoteState>,
    port: Option<u16>,
    lan: Option<bool>,
) -> Result<RemoteStatus, String> {
    let mut cfg = load_config(&app)?;
    if let Some(p) = port.filter(|p| *p >= 1024) {
        cfg.port = p;
    }
    if let Some(l) = lan {
        cfg.lan = l;
    }
    save_config(&app, &cfg)?;
    stop_server(&st);

    let ip = if cfg.lan { [0, 0, 0, 0] } else { [127, 0, 0, 1] };
    let addr = SocketAddr::from((ip, cfg.port));
    // Al reiniciar, el listener anterior se cierra de forma asíncrona → reintentar un poco.
    let mut tries = 0;
    let listener = loop {
        match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => break l,
            Err(_) if tries < 10 => {
                tries += 1;
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
            }
            Err(e) => return Err(format!("No se pudo abrir el puerto {}: {}", cfg.port, e)),
        }
    };
    let (down_tx, down_rx) = watch::channel(false);
    let app2 = app.clone();
    let on_action: OnAction = Arc::new(move |v| {
        let _ = app2.emit("remote://action", v);
    });
    tokio::spawn(serve(listener, Arc::new(cfg.token.clone()), st.shared.clone(), st.tx.clone(), down_rx, on_action));
    *st.server.lock().unwrap() = Some((down_tx, cfg.port, cfg.lan));
    let _ = app.emit("remote://status", ());
    status_of(&app, &st)
}

fn stop_server(st: &RemoteState) {
    if let Some((down, _, _)) = st.server.lock().unwrap().take() {
        let _ = down.send(true);
    }
}

fn stop_tunnel(st: &RemoteState) {
    if let Some(mut c) = st.tunnel.lock().unwrap().take() {
        let _ = c.kill();
        let _ = c.wait();
    }
    *st.tunnel_url.lock().unwrap() = None;
}

#[tauri::command]
pub fn remote_stop(app: AppHandle, st: State<'_, RemoteState>) -> Result<RemoteStatus, String> {
    stop_tunnel(&st);
    stop_server(&st);
    let _ = app.emit("remote://status", ());
    status_of(&app, &st)
}

/// Llamar al salir de la app: que cloudflared no quede vivo.
pub fn shutdown(app: &AppHandle) {
    if let Some(st) = app.try_state::<RemoteState>() {
        stop_tunnel(&st);
        stop_server(&st);
    }
}

#[tauri::command]
pub fn remote_regen_token(app: AppHandle, st: State<'_, RemoteState>) -> Result<RemoteStatus, String> {
    let mut cfg = load_config(&app)?;
    cfg.token = new_token()?;
    save_config(&app, &cfg)?;
    // El servidor lee el token al arrancar → reiniciarlo para invalidar los enlaces viejos.
    let was = st.server.lock().unwrap().as_ref().map(|s| (s.1, s.2));
    if let Some((port, lan)) = was {
        let app2 = app.clone();
        tauri::async_runtime::spawn(async move {
            let st = app2.state::<RemoteState>();
            let _ = remote_start(app2.clone(), st, Some(port), Some(lan)).await;
        });
    }
    status_of(&app, &st)
}

#[tauri::command]
pub fn remote_publish(st: State<'_, RemoteState>, id: String, snapshot: serde_json::Value) {
    publish(&st.shared, &st.tx, |g| {
        g.snapshots.insert(id, snapshot);
    });
}

#[tauri::command]
pub fn remote_set_projects(st: State<'_, RemoteState>, projects: serde_json::Value) {
    publish(&st.shared, &st.tx, |g| g.projects = projects);
}

// Aplica un cambio, sube la versión y despierta a los teléfonos que esperan en /api/poll.
fn publish(shared: &Arc<Mutex<Shared>>, tx: &broadcast::Sender<String>, f: impl FnOnce(&mut Shared)) {
    let v = {
        let mut g = shared.lock().unwrap();
        f(&mut g);
        g.version += 1;
        g.version
    };
    let _ = tx.send(v.to_string());
}

/// Túnel rápido de Cloudflare (sin cuenta): publica el servidor local en una URL
/// https://<algo>.trycloudflare.com que cambia en cada arranque.
#[tauri::command]
pub fn remote_tunnel_start(app: AppHandle, st: State<'_, RemoteState>) -> Result<RemoteStatus, String> {
    let port = st
        .server
        .lock()
        .unwrap()
        .as_ref()
        .map(|s| s.1)
        .ok_or("Primero activa el servidor")?;
    let exe = find_cloudflared().ok_or("cloudflared no está instalado")?;
    stop_tunnel(&st);
    let mut cmd = Command::new(exe);
    cmd.args(["tunnel", "--no-autoupdate", "--url", &format!("http://127.0.0.1:{}", port)])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd.spawn().map_err(|e| format!("No se pudo lanzar cloudflared: {}", e))?;
    let stderr = child.stderr.take();
    *st.tunnel.lock().unwrap() = Some(child);
    let url_slot = st.tunnel_url.clone();
    let app2 = app.clone();
    if let Some(err) = stderr {
        std::thread::spawn(move || {
            let re = regex::Regex::new(r"https://[a-z0-9-]+\.trycloudflare\.com").unwrap();
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                if let Some(m) = re.find(&line) {
                    *url_slot.lock().unwrap() = Some(m.as_str().to_string());
                    let _ = app2.emit("remote://status", ());
                }
            }
            // cloudflared terminó
            *url_slot.lock().unwrap() = None;
            let _ = app2.emit("remote://status", ());
        });
    }
    status_of(&app, &st)
}

#[tauri::command]
pub fn remote_tunnel_stop(app: AppHandle, st: State<'_, RemoteState>) -> Result<RemoteStatus, String> {
    stop_tunnel(&st);
    let _ = app.emit("remote://status", ());
    status_of(&app, &st)
}

/// Instala cloudflared con winget (Windows). Bloqueante: puede tardar ~1 min.
#[tauri::command]
pub async fn remote_install_cloudflared() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        if !cfg!(windows) {
            return Err("Instala cloudflared con tu gestor de paquetes (brew install cloudflared, apt…)".to_string());
        }
        let mut cmd = Command::new("winget");
        cmd.args([
            "install",
            "--id",
            "Cloudflare.cloudflared",
            "-e",
            "--silent",
            "--accept-source-agreements",
            "--accept-package-agreements",
        ])
        .stdin(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let out = cmd.output().map_err(|e| format!("No se pudo ejecutar winget: {}", e))?;
        let text = String::from_utf8_lossy(&out.stdout).to_string();
        if find_cloudflared().is_some() {
            Ok("cloudflared instalado".to_string())
        } else {
            Err(format!("winget terminó sin instalar cloudflared:\n{}", text.trim()))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}


#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn servidor_remoto_extremo_a_extremo() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let token = "a".repeat(64);
        let shared: Arc<Mutex<Shared>> = Default::default();
        shared.lock().unwrap().projects = serde_json::json!([{ "id": "P1", "name": "demo" }]);
        let (tx, _) = broadcast::channel(16);
        let (down_tx, down_rx) = watch::channel(false);
        let got: Arc<Mutex<Vec<serde_json::Value>>> = Default::default();
        let got2 = got.clone();
        let on_action: OnAction = Arc::new(move |v| got2.lock().unwrap().push(v));
        tokio::spawn(serve(listener, Arc::new(token.clone()), shared.clone(), tx.clone(), down_rx, on_action));

        let base = format!("http://127.0.0.1:{}", port);
        let c = reqwest::Client::builder().no_proxy().build().unwrap();

        // Sin token / token incorrecto → 401
        assert_eq!(c.get(format!("{}/", base)).send().await.unwrap().status(), 401);
        assert_eq!(c.get(format!("{}/api/state?t=bad", base)).send().await.unwrap().status(), 401);
        assert_eq!(c.get(format!("{}/api/state?t={}", base, "b".repeat(64))).send().await.unwrap().status(), 401);

        // Página con ?t= → cookie
        let r = c.get(format!("{}/?t={}", base, token)).send().await.unwrap();
        assert_eq!(r.status(), 200);
        let cookie = r.headers().get("set-cookie").unwrap().to_str().unwrap().to_string();
        assert!(cookie.starts_with(&format!("agt={};", token)) && cookie.contains("HttpOnly"));
        assert!(r.text().await.unwrap().contains("Agentico"));

        // La cookie basta para la API
        let r = c.get(format!("{}/api/state", base)).header("cookie", format!("agt={}", token)).send().await.unwrap();
        assert_eq!(r.status(), 200);
        let v: serde_json::Value = r.json().await.unwrap();
        assert_eq!(v["projects"][0]["id"], "P1");

        // Poll sin versión → responde al instante (id con barras y dos puntos, codificado)
        let pid = "E:\\Proj X";
        publish(&shared, &tx, |g| {
            g.snapshots.insert(pid.into(), serde_json::json!({ "busy": true, "messages": [] }));
        });
        let poll = |v: Option<u64>| {
            let c = c.clone();
            let url = format!(
                "{}/api/poll?p={}{}",
                base,
                "E%3A%5CProj+X",
                v.map(|v| format!("&v={}", v)).unwrap_or_default()
            );
            let token = token.clone();
            async move {
                let r = c.get(url).header("x-agentico-token", token).send().await.unwrap();
                assert_eq!(r.status(), 200);
                r.json::<serde_json::Value>().await.unwrap()
            }
        };
        let t = std::time::Instant::now();
        let v0 = poll(None).await;
        assert!(t.elapsed().as_millis() < 1000);
        assert_eq!(v0["pid"], pid);
        assert_eq!(v0["snapshot"]["busy"], true);
        assert_eq!(v0["busy"][pid], true);
        let ver = v0["version"].as_u64().unwrap();

        // Poll con la versión actual → espera hasta que haya un cambio
        let waiting = tokio::spawn(poll(Some(ver)));
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        assert!(!waiting.is_finished(), "debería estar esperando");
        publish(&shared, &tx, |g| {
            g.snapshots.insert(pid.into(), serde_json::json!({ "busy": false }));
        });
        let v1 = tokio::time::timeout(std::time::Duration::from_secs(2), waiting).await.unwrap().unwrap();
        assert_eq!(v1["version"].as_u64().unwrap(), ver + 1);
        assert_eq!(v1["snapshot"]["busy"], false);

        // Poll con versión vieja → al instante
        let t = std::time::Instant::now();
        poll(Some(ver)).await;
        assert!(t.elapsed().as_millis() < 1000);

        // Una espera en curso termina al apagar el servidor
        let waiting = tokio::spawn(poll(Some(ver + 1)));
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        // Acción del teléfono → callback
        let r = c
            .post(format!("{}/api/action", base))
            .header("x-agentico-token", &token)
            .body(r#"{"id":"P1","action":{"type":"send","text":"hola"}}"#)
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 200);
        let r = c.post(format!("{}/api/action", base)).header("x-agentico-token", &token).body("{}").send().await.unwrap();
        assert_eq!(r.status(), 400);
        let r = c.post(format!("{}/api/action?t=nope", base)).body(r#"{"id":"P1","action":{}}"#).send().await.unwrap();
        assert_eq!(r.status(), 401);
        let got = got.lock().unwrap().clone();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0]["action"]["text"], "hola");

        down_tx.send(true).unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(2), waiting).await.unwrap().unwrap();
    }

    #[test]
    fn decodifica_urls() {
        assert_eq!(percent_decode("E%3A%5CQuiz+Practice"), "E:\\Quiz Practice");
        assert_eq!(percent_decode("a%2"), "a%2");
        assert_eq!(percent_decode("%C3%B1"), "ñ");
    }

    #[test]
    fn comparacion_de_token() {
        assert!(same("abc", "abc"));
        assert!(!same("abc", "abd"));
        assert!(!same("abc", "ab"));
        assert_eq!(query_param("x=1&t=zz", "t").as_deref(), Some("zz"));
    }
}
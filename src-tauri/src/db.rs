// Gestor de bases de datos PostgreSQL externas (estilo Supabase): conexión con TLS,
// introspección del esquema, editor SQL y edición de filas por clave primaria.
// Las contraseñas se guardan en el Administrador de credenciales de Windows (keyring),
// nunca en disco; la lista de conexiones (sin contraseña) la guarda el frontend.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;
use tokio_postgres::types::ToSql;
use tokio_postgres::{Client, SimpleQueryMessage};

#[derive(Default)]
pub struct DbState(Mutex<HashMap<String, Arc<Client>>>);

#[derive(Deserialize, Serialize, Clone)]
pub struct DbConn {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    /// "disable" | "require" (cifra sin validar el certificado, como psql) | "verify"
    pub ssl: String,
}

const KEYRING_SERVICE: &str = "agentico-db";

fn entry(id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_password_set(id: String, password: String) -> Result<(), String> {
    entry(&id)?.set_password(&password).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_password_delete(id: String) -> Result<(), String> {
    match entry(&id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

fn client(state: &State<DbState>, id: &str) -> Result<Arc<Client>, String> {
    state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .get(id)
        .cloned()
        .ok_or_else(|| "No conectado".to_string())
}

/// Conecta (o reconecta). Sin `password` usa la guardada. Devuelve la versión del servidor.
#[tauri::command]
pub async fn db_connect(state: State<'_, DbState>, conn: DbConn, password: Option<String>) -> Result<String, String> {
    let password = match password {
        Some(p) => p,
        None => match entry(&conn.id)?.get_password() {
            Ok(p) => p,
            Err(keyring::Error::NoEntry) => String::new(),
            Err(e) => return Err(e.to_string()),
        },
    };
    let mut cfg = tokio_postgres::Config::new();
    cfg.host(&conn.host)
        .port(conn.port)
        .dbname(&conn.database)
        .user(&conn.user)
        .password(password)
        .application_name("Agentico")
        .connect_timeout(Duration::from_secs(12));

    let client = if conn.ssl == "disable" {
        let (client, connection) = cfg.connect(tokio_postgres::NoTls).await.map_err(|e| pg_err(&e))?;
        tauri::async_runtime::spawn(async move {
            let _ = connection.await;
        });
        client
    } else {
        cfg.ssl_mode(tokio_postgres::config::SslMode::Require);
        let lax = conn.ssl != "verify";
        let tls = native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(lax)
            .danger_accept_invalid_hostnames(lax)
            .build()
            .map_err(|e| e.to_string())?;
        let (client, connection) = cfg
            .connect(postgres_native_tls::MakeTlsConnector::new(tls))
            .await
            .map_err(|e| pg_err(&e))?;
        tauri::async_runtime::spawn(async move {
            let _ = connection.await;
        });
        client
    };

    let version = client
        .simple_query("SHOW server_version")
        .await
        .ok()
        .and_then(|msgs| {
            msgs.into_iter().find_map(|m| match m {
                SimpleQueryMessage::Row(r) => r.get(0).map(|s| s.to_string()),
                _ => None,
            })
        })
        .unwrap_or_default();
    state.0.lock().map_err(|e| e.to_string())?.insert(conn.id, Arc::new(client));
    Ok(version)
}

#[tauri::command]
pub fn db_disconnect(state: State<DbState>, id: String) -> Result<(), String> {
    state.0.lock().map_err(|e| e.to_string())?.remove(&id);
    Ok(())
}

/// Mensaje de error de Postgres con detalle y pista cuando los hay.
fn pg_err(e: &tokio_postgres::Error) -> String {
    if let Some(db) = e.as_db_error() {
        let mut s = format!("{}: {}", db.severity(), db.message());
        if let Some(d) = db.detail() {
            s.push_str(&format!("\nDetalle: {}", d));
        }
        if let Some(h) = db.hint() {
            s.push_str(&format!("\nPista: {}", h));
        }
        if let Some(p) = db.position() {
            if let tokio_postgres::error::ErrorPosition::Original(n) = p {
                s.push_str(&format!("\nPosición: {}", n));
            }
        }
        return s;
    }
    let mut s = e.to_string();
    let mut src = std::error::Error::source(e);
    while let Some(inner) = src {
        s.push_str(&format!(": {}", inner));
        src = inner.source();
    }
    s
}

#[derive(Serialize, Default, Debug)]
pub struct QueryResult {
    columns: Vec<String>,
    rows: Vec<Vec<Option<String>>>,
    /// Filas afectadas / devueltas según el servidor.
    affected: u64,
    truncated: bool,
}

const MAX_ROWS: usize = 2000;

/// Ejecuta SQL con el protocolo simple: admite varias sentencias y devuelve todo como
/// texto (cualquier tipo de Postgres se muestra tal cual lo imprime el servidor).
async fn run_simple(client: &Client, sql: &str) -> Result<Vec<QueryResult>, String> {
    let msgs = client.simple_query(sql).await.map_err(|e| pg_err(&e))?;
    let mut out = vec![];
    let mut cur = QueryResult::default();
    for m in msgs {
        match m {
            SimpleQueryMessage::RowDescription(cols) => {
                cur.columns = cols.iter().map(|c| c.name().to_string()).collect();
            }
            SimpleQueryMessage::Row(r) => {
                if cur.columns.is_empty() {
                    cur.columns = r.columns().iter().map(|c| c.name().to_string()).collect();
                }
                if cur.rows.len() < MAX_ROWS {
                    cur.rows.push((0..r.len()).map(|i| r.get(i).map(|s| s.to_string())).collect());
                } else {
                    cur.truncated = true;
                }
            }
            SimpleQueryMessage::CommandComplete(n) => {
                cur.affected = n;
                out.push(std::mem::take(&mut cur));
            }
            _ => {}
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn db_query(state: State<'_, DbState>, id: String, sql: String) -> Result<Vec<QueryResult>, String> {
    let c = client(&state, &id)?;
    run_simple(&c, &sql).await
}

#[derive(Serialize)]
pub struct ColumnInfo {
    name: String,
    #[serde(rename = "type")]
    ty: String,
    nullable: bool,
    default: Option<String>,
    pk: bool,
}

#[derive(Serialize)]
pub struct TableInfo {
    schema: String,
    name: String,
    /// "table" | "view" | "matview" | "foreign" | "partitioned"
    kind: String,
    estimate: i64,
    columns: Vec<ColumnInfo>,
}

const SCHEMA_SQL: &str = r#"
SELECT n.nspname, c.relname, c.relkind::text, c.reltuples::bigint,
       a.attname, format_type(a.atttypid, a.atttypmod), (NOT a.attnotnull)::text,
       pg_get_expr(d.adbin, d.adrelid),
       (EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY(i.indkey)))::text
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE c.relkind IN ('r','v','m','f','p')
  AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
  AND n.nspname NOT LIKE 'pg_temp%' AND n.nspname NOT LIKE 'pg_toast_temp%'
ORDER BY n.nspname, c.relname, a.attnum
"#;

#[tauri::command]
pub async fn db_schema(state: State<'_, DbState>, id: String) -> Result<Vec<TableInfo>, String> {
    let c = client(&state, &id)?;
    schema_impl(&c).await
}

async fn schema_impl(c: &Client) -> Result<Vec<TableInfo>, String> {
    let res = run_simple(c, SCHEMA_SQL).await?;
    let mut out: Vec<TableInfo> = vec![];
    for r in res.into_iter().flat_map(|q| q.rows) {
        let g = |i: usize| r.get(i).cloned().flatten();
        let schema = g(0).unwrap_or_default();
        let name = g(1).unwrap_or_default();
        let new_table = out.last().map(|t| t.schema != schema || t.name != name).unwrap_or(true);
        if new_table {
            let kind = match g(2).as_deref() {
                Some("v") => "view",
                Some("m") => "matview",
                Some("f") => "foreign",
                Some("p") => "partitioned",
                _ => "table",
            };
            out.push(TableInfo {
                schema: schema.clone(),
                name: name.clone(),
                kind: kind.into(),
                estimate: g(3).and_then(|s| s.parse().ok()).unwrap_or(-1),
                columns: vec![],
            });
        }
        if let Some(col) = g(4) {
            out.last_mut().unwrap().columns.push(ColumnInfo {
                name: col,
                ty: g(5).unwrap_or_default(),
                nullable: g(6).as_deref() == Some("true"),
                default: g(7),
                pk: g(8).as_deref() == Some("true"),
            });
        }
    }
    Ok(out)
}

fn ident(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

/// Tipo SQL tal cual lo da format_type (solo caracteres que puede contener).
fn safe_type(t: &str) -> Result<&str, String> {
    if !t.is_empty() && t.chars().all(|c| c.is_alphanumeric() || " _.,()[]\"".contains(c)) {
        Ok(t)
    } else {
        Err(format!("tipo no válido: {}", t))
    }
}

#[derive(Serialize)]
pub struct RowsPage {
    result: QueryResult,
    total: i64,
    exact: bool,
}

/// Página de filas de una tabla. `filter` es una condición WHERE escrita por el usuario.
#[tauri::command]
pub async fn db_rows(
    state: State<'_, DbState>,
    id: String,
    schema: String,
    table: String,
    limit: u32,
    offset: u32,
    order_by: Option<String>,
    desc: bool,
    filter: Option<String>,
) -> Result<RowsPage, String> {
    let c = client(&state, &id)?;
    rows_impl(&c, &schema, &table, limit, offset, order_by, desc, filter).await
}

#[allow(clippy::too_many_arguments)]
async fn rows_impl(
    c: &Client,
    schema: &str,
    table: &str,
    limit: u32,
    offset: u32,
    order_by: Option<String>,
    desc: bool,
    filter: Option<String>,
) -> Result<RowsPage, String> {
    let rel = format!("{}.{}", ident(schema), ident(table));
    let filter = filter.map(|f| f.trim().to_string()).filter(|f| !f.is_empty());
    let where_ = filter.as_ref().map(|f| format!(" WHERE {}", f)).unwrap_or_default();
    let order = order_by
        .map(|o| format!(" ORDER BY {} {}", ident(&o), if desc { "DESC" } else { "ASC" }))
        .unwrap_or_default();
    let sql = format!("SELECT * FROM {}{}{} LIMIT {} OFFSET {}", rel, where_, order, limit.min(1000), offset);
    let mut res = run_simple(c, &sql).await?;
    let result = res.pop().unwrap_or_default();

    // Total: estimación del planificador en tablas grandes sin filtro; exacto si no.
    let est = run_simple(c, &format!("SELECT reltuples::bigint FROM pg_class WHERE oid = '{}'::regclass", rel.replace('\'', "''")))
        .await
        .ok()
        .and_then(|r| r.into_iter().next()?.rows.into_iter().next()?.into_iter().next()?)
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(-1);
    let (total, exact) = if filter.is_none() && est > 200_000 {
        (est, false)
    } else {
        let n = run_simple(c, &format!("SELECT count(*) FROM {}{}", rel, where_))
            .await?
            .into_iter()
            .next()
            .and_then(|r| r.rows.into_iter().next())
            .and_then(|r| r.into_iter().next().flatten())
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        (n, true)
    };
    Ok(RowsPage { result, total, exact })
}

#[derive(Deserialize)]
pub struct Cell {
    col: String,
    #[serde(rename = "type")]
    ty: String,
    /// Texto tal cual lo escribe el usuario (Postgres lo convierte al tipo). None = NULL.
    value: Option<String>,
}

/// `"col" = CAST($n::text AS tipo)`; los valores van como parámetros (nunca concatenados).
fn bind<'a>(cells: &'a [Cell], params: &mut Vec<&'a Option<String>>, sep: &str) -> Result<String, String> {
    let mut parts = vec![];
    for c in cells {
        params.push(&c.value);
        parts.push(format!("{} = CAST(${}::text AS {})", ident(&c.col), params.len(), safe_type(&c.ty)?));
    }
    Ok(parts.join(sep))
}

async fn exec(c: &Client, sql: &str, params: &[&Option<String>]) -> Result<u64, String> {
    let p: Vec<&(dyn ToSql + Sync)> = params.iter().map(|v| *v as &(dyn ToSql + Sync)).collect();
    c.execute(sql, &p).await.map_err(|e| pg_err(&e))
}

#[tauri::command]
pub async fn db_update(
    state: State<'_, DbState>,
    id: String,
    schema: String,
    table: String,
    key: Vec<Cell>,
    set: Vec<Cell>,
) -> Result<u64, String> {
    if key.is_empty() {
        return Err("La tabla no tiene clave primaria: no se puede editar la fila de forma segura.".into());
    }
    let c = client(&state, &id)?;
    update_impl(&c, &schema, &table, &key, &set).await
}

async fn update_impl(c: &Client, schema: &str, table: &str, key: &[Cell], set: &[Cell]) -> Result<u64, String> {
    let mut params = vec![];
    let set_sql = bind(set, &mut params, ", ")?;
    let where_sql = bind(key, &mut params, " AND ")?;
    let sql = format!("UPDATE {}.{} SET {} WHERE {}", ident(schema), ident(table), set_sql, where_sql);
    exec(c, &sql, &params).await
}

#[tauri::command]
pub async fn db_insert(state: State<'_, DbState>, id: String, schema: String, table: String, values: Vec<Cell>) -> Result<u64, String> {
    let c = client(&state, &id)?;
    insert_impl(&c, &schema, &table, &values).await
}

async fn insert_impl(c: &Client, schema: &str, table: &str, values: &[Cell]) -> Result<u64, String> {
    let rel = format!("{}.{}", ident(schema), ident(table));
    if values.is_empty() {
        return exec(c, &format!("INSERT INTO {} DEFAULT VALUES", rel), &[]).await;
    }
    let mut params = vec![];
    let mut cols = vec![];
    let mut vals = vec![];
    for v in values {
        params.push(&v.value);
        cols.push(ident(&v.col));
        vals.push(format!("CAST(${}::text AS {})", params.len(), safe_type(&v.ty)?));
    }
    let sql = format!("INSERT INTO {} ({}) VALUES ({})", rel, cols.join(", "), vals.join(", "));
    exec(c, &sql, &params).await
}

/// Borra filas identificadas por su clave primaria (todas o ninguna).
#[tauri::command]
pub async fn db_delete(state: State<'_, DbState>, id: String, schema: String, table: String, keys: Vec<Vec<Cell>>) -> Result<u64, String> {
    if keys.iter().any(|k| k.is_empty()) {
        return Err("La tabla no tiene clave primaria: no se pueden borrar filas de forma segura.".into());
    }
    let c = client(&state, &id)?;
    delete_impl(&c, &schema, &table, &keys).await
}

async fn delete_impl(c: &Client, schema: &str, table: &str, keys: &[Vec<Cell>]) -> Result<u64, String> {
    if keys.is_empty() {
        return Ok(0);
    }
    // Una sola sentencia (atómica): WHERE (pk = $1) OR (pk = $2) … — si un valor no es
    // válido para su tipo, falla entera y no se borra nada.
    let mut params = vec![];
    let mut groups = vec![];
    for key in keys {
        groups.push(format!("({})", bind(key, &mut params, " AND ")?));
    }
    let sql = format!("DELETE FROM {}.{} WHERE {}", ident(schema), ident(table), groups.join(" OR "));
    exec(c, &sql, &params).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cell(col: &str, ty: &str, value: Option<&str>) -> Cell {
        Cell { col: col.into(), ty: ty.into(), value: value.map(|v| v.to_string()) }
    }

    /// AG_PG_TEST_PORT=54329 cargo test --lib db::tests -- --nocapture
    #[test]
    fn live_postgres() {
        let Ok(port) = std::env::var("AG_PG_TEST_PORT") else {
            eprintln!("AG_PG_TEST_PORT no definido: test omitido");
            return;
        };
        tauri::async_runtime::block_on(async move {
            // PGlite (Postgres en WASM) no descarta los mensajes del protocolo extendido tras
            // un error como hace Postgres real: tras cada error provocado, conexión nueva.
            let connect = || async {
                let (c, conn) = tokio_postgres::connect(
                    &format!("host=127.0.0.1 port={} user=postgres dbname=postgres", port),
                    tokio_postgres::NoTls,
                )
                .await
                .expect("conexión");
                tauri::async_runtime::spawn(async move {
                    let _ = conn.await;
                });
                c
            };
            let c = connect().await;

            // Esquema: tablas, vista, tipos, PK, nulos, defaults.
            let tables = schema_impl(&c).await.unwrap();
            let users = tables.iter().find(|t| t.name == "users").expect("users");
            let names: Vec<_> = users.columns.iter().map(|c| format!("{}:{}{}", c.name, c.ty, if c.pk { "*" } else { "" })).collect();
            println!("users → {:?}", names);
            assert!(users.columns.iter().any(|c| c.name == "id" && c.pk));
            assert_eq!(tables.iter().find(|t| t.name == "active_users").map(|t| t.kind.as_str()), Some("view"));
            assert!(tables.iter().any(|t| t.name == "logs" && t.columns.iter().all(|c| !c.pk)));
            let order: Vec<_> = tables.iter().map(|t| format!("{}.{}", t.schema, t.name)).collect();
            println!("tablas → {:?}", order);

            // Página de filas con orden y filtro.
            let page = rows_impl(&c, "public", "users", 2, 0, Some("id".into()), true, Some("id > 0".into())).await.unwrap();
            println!("rows → total {} exact {} cols {:?} rows {:?}", page.total, page.exact, page.result.columns, page.result.rows);
            assert_eq!(page.total, 3);
            assert_eq!(page.result.rows.len(), 2);
            assert_eq!(page.result.rows[0][0].as_deref(), Some("3"));

            // Update tipado (jsonb, enum, date → NULL, nombre con comillas).
            let n = update_impl(
                &c,
                "public",
                "users",
                &[cell("id", "integer", Some("1"))],
                &[
                    cell("meta", "jsonb", Some(r#"{"plan": "pro", "n": 2}"#)),
                    cell("mood", "mood", Some("happy")),
                    cell("born", "date", None),
                    cell("name", "text", Some("O'Brien \"Bob\"")),
                ],
            )
            .await
            .unwrap();
            assert_eq!(n, 1);
            let r = run_simple(&c, "SELECT meta::text, mood::text, born, name FROM users WHERE id = 1").await.unwrap();
            println!("update → {:?}", r[0].rows[0]);
            assert_eq!(r[0].rows[0][2], None);
            assert_eq!(r[0].rows[0][3].as_deref(), Some("O'Brien \"Bob\""));

            // Valor inválido para el tipo → error legible de Postgres.
            let e = update_impl(&c, "public", "users", &[cell("id", "integer", Some("1"))], &[cell("mood", "mood", Some("furioso"))])
                .await
                .unwrap_err();
            println!("error enum → {}", e);
            assert!(e.contains("mood"));
            drop(c);
            std::thread::sleep(Duration::from_millis(300));
            let c = connect().await;

            // Insert (columnas omitidas = DEFAULT) y delete por PK en transacción.
            let n = insert_impl(&c, "public", "users", &[cell("name", "text", Some("Nuevo")), cell("mood", "mood", Some("sad"))]).await.map_err(|e| { println!("insert error → {}", e); e }).unwrap();
            assert_eq!(n, 1);
            let new_id = run_simple(&c, "SELECT id FROM users WHERE name = 'Nuevo'").await.unwrap()[0].rows[0][0].clone().unwrap();
            let n = delete_impl(&c, "public", "users", &[vec![cell("id", "integer", Some(&new_id))], vec![cell("id", "integer", Some("2"))]]).await.unwrap();
            assert_eq!(n, 2);
            let left = run_simple(&c, "SELECT count(*) FROM users").await.unwrap()[0].rows[0][0].clone();
            println!("tras borrar → {:?} filas", left);
            assert_eq!(left.as_deref(), Some("2"));

            // Borrado que falla a mitad → se revierte todo.
            let e = delete_impl(&c, "public", "users", &[vec![cell("id", "integer", Some("1"))], vec![cell("id", "integer", Some("abc"))]]).await;
            assert!(e.is_err());
            drop(c);
            std::thread::sleep(Duration::from_millis(300));
            let c = connect().await;
            let left = run_simple(&c, "SELECT count(*) FROM users").await.unwrap()[0].rows[0][0].clone();
            assert_eq!(left.as_deref(), Some("2"), "rollback");

            // Varias sentencias: un resultado por sentencia; columnas aunque no haya filas.
            let r = run_simple(&c, "SELECT 1 AS a, NULL AS b; UPDATE users SET name = name WHERE id < 0; SELECT 'x' AS vacio WHERE false").await.unwrap();
            println!("multi → {:?}", r.iter().map(|q| (q.columns.clone(), q.rows.len(), q.affected)).collect::<Vec<_>>());
            assert_eq!(r.len(), 3);
            assert_eq!(r[0].rows[0], vec![Some("1".to_string()), None]);
            assert_eq!(r[2].columns, vec!["vacio".to_string()]);

            // Error de sintaxis con posición.
            let e = run_simple(&c, "SELEC 1").await.unwrap_err();
            println!("error sql → {}", e);
            assert!(e.contains("Posición"));

            // Tipo inyectado → rechazado antes de llegar a Postgres.
            assert!(safe_type("text); DROP TABLE users; --").is_err());
        });
    }
}

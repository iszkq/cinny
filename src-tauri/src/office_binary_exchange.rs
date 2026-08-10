use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle, Manager, WebviewWindow,
};

const OFFICE_SESSION_ROOT_DIR: &str = "office-session-v1";
const OFFICE_WINDOW_LABEL_PREFIX: &str = "office-window-";
const OFFICE_SESSION_HEADER: &str = "x-cinny-office-session";
const OFFICE_BINARY_MAX_BYTES: usize = 256 * 1024 * 1024;

static OFFICE_BINARY_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficeSessionBinaryDescriptor {
    token: String,
    byte_length: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsumeOfficeSessionBinaryRequest {
    session_id: String,
    token: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearOfficeSessionRequest {
    session_id: String,
}

fn hash_string(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn validate_session_id(session_id: &str) -> Result<&str, String> {
    let session_id = session_id.trim();
    if !(8..=96).contains(&session_id.len())
        || !session_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err("Invalid Office session id.".into());
    }

    Ok(session_id)
}

fn validate_token(token: &str) -> Result<&str, String> {
    let token = token.trim();
    if token.len() != 64 || !token.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("Invalid Office binary token.".into());
    }

    Ok(token)
}

fn validate_caller(window: &WebviewWindow, session_id: &str) -> Result<(), String> {
    let label = window.label();
    let expected_office_label = format!("{OFFICE_WINDOW_LABEL_PREFIX}{session_id}");
    if label == "main" || label == expected_office_label {
        return Ok(());
    }

    Err("Office binary exchange is not available to this window.".into())
}

fn get_office_session_root(app: &AppHandle) -> Result<PathBuf, String> {
    let app_local_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("failed to resolve Office session directory: {error}"))?;

    Ok(app_local_data_dir.join(OFFICE_SESSION_ROOT_DIR))
}

fn get_office_session_dir(app: &AppHandle, session_id: &str) -> Result<PathBuf, String> {
    Ok(get_office_session_root(app)?.join(hash_string(session_id)))
}

fn get_binary_path(session_dir: &Path, token: &str) -> PathBuf {
    session_dir.join(format!("{token}.bin"))
}

fn get_binary_temp_path(session_dir: &Path, token: &str) -> PathBuf {
    session_dir.join(format!("{token}.download"))
}

fn generate_binary_token(session_id: &str, caller_label: &str, byte_length: usize) -> String {
    let sequence = OFFICE_BINARY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();

    hash_string(&format!(
        "{session_id}:{caller_label}:{timestamp}:{sequence}:{byte_length}"
    ))
}

fn remove_session_dir_if_empty(session_dir: &Path) {
    let is_empty = fs::read_dir(session_dir)
        .map(|mut entries| entries.next().is_none())
        .unwrap_or(false);
    if is_empty {
        let _ = fs::remove_dir(session_dir);
    }
}

#[tauri::command]
pub fn write_office_session_binary(
    app: AppHandle,
    window: WebviewWindow,
    request: Request<'_>,
) -> Result<OfficeSessionBinaryDescriptor, String> {
    let session_id = request
        .headers()
        .get(OFFICE_SESSION_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "Missing Office session id.".to_owned())?;
    let session_id = validate_session_id(session_id)?;
    validate_caller(&window, session_id)?;

    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Office binary payload must use raw IPC.".into());
    };
    if bytes.is_empty() {
        return Err("Office binary payload is empty.".into());
    }
    if bytes.len() > OFFICE_BINARY_MAX_BYTES {
        return Err("Office document exceeds the 256 MB desktop window limit.".into());
    }

    let session_dir = get_office_session_dir(&app, session_id)?;
    fs::create_dir_all(&session_dir)
        .map_err(|error| format!("failed to create Office session directory: {error}"))?;

    let token = generate_binary_token(session_id, window.label(), bytes.len());
    let temp_path = get_binary_temp_path(&session_dir, &token);
    let binary_path = get_binary_path(&session_dir, &token);
    fs::write(&temp_path, bytes)
        .map_err(|error| format!("failed to write Office session binary: {error}"))?;
    fs::rename(&temp_path, &binary_path).map_err(|error| {
        let _ = fs::remove_file(&temp_path);
        format!("failed to finalize Office session binary: {error}")
    })?;

    Ok(OfficeSessionBinaryDescriptor {
        token,
        byte_length: bytes.len(),
    })
}

#[tauri::command]
pub fn consume_office_session_binary(
    app: AppHandle,
    window: WebviewWindow,
    request: ConsumeOfficeSessionBinaryRequest,
) -> Result<Response, String> {
    let session_id = validate_session_id(&request.session_id)?;
    let token = validate_token(&request.token)?;
    validate_caller(&window, session_id)?;

    let session_dir = get_office_session_dir(&app, session_id)?;
    let binary_path = get_binary_path(&session_dir, token);
    let bytes = fs::read(&binary_path)
        .map_err(|error| format!("failed to read Office session binary: {error}"))?;
    if bytes.is_empty() || bytes.len() > OFFICE_BINARY_MAX_BYTES {
        let _ = fs::remove_file(&binary_path);
        remove_session_dir_if_empty(&session_dir);
        return Err("Office session binary is empty or exceeds the desktop limit.".into());
    }

    fs::remove_file(&binary_path)
        .map_err(|error| format!("failed to consume Office session binary: {error}"))?;
    remove_session_dir_if_empty(&session_dir);

    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn clear_office_session_binaries(
    app: AppHandle,
    window: WebviewWindow,
    request: ClearOfficeSessionRequest,
) -> Result<(), String> {
    let session_id = validate_session_id(&request.session_id)?;
    if window.label() != "main" {
        return Err("Only the main window can clear Office session files.".into());
    }

    let session_dir = get_office_session_dir(&app, session_id)?;
    if session_dir.exists() {
        fs::remove_dir_all(&session_dir)
            .map_err(|error| format!("failed to clear Office session files: {error}"))?;
    }

    Ok(())
}

pub fn clear_office_session_runtime(app: &AppHandle) -> Result<(), String> {
    let root = get_office_session_root(app)?;
    if root.exists() {
        fs::remove_dir_all(root)
            .map_err(|error| format!("failed to clear Office session runtime: {error}"))?;
    }

    Ok(())
}

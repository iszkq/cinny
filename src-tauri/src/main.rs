#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop_media_cache;

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine};
use serde::Deserialize;
use std::{fs, process::Command};
use tauri::{plugin::PermissionState, AppHandle};
use tauri_plugin_notification::NotificationExt;

const ALLOWED_EXTERNAL_URL_PREFIXES: [&str; 5] =
    ["http://", "https://", "mailto:", "ftp://", "magnet:"];

#[derive(Deserialize)]
struct DesktopNotificationPayload {
    title: String,
    body: Option<String>,
    silent: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveDownloadedFileRequest {
    file_name: String,
    data_base64: String,
}

fn map_notification_permission(state: PermissionState) -> &'static str {
    match state {
        PermissionState::Granted => "granted",
        PermissionState::Denied => "denied",
        PermissionState::Prompt | PermissionState::PromptWithRationale => "prompt",
    }
}

fn sanitize_download_file_name(file_name: &str) -> String {
    let sanitized = file_name
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_control() || matches!(ch, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
            {
                '_'
            } else {
                ch
            }
        })
        .collect::<String>();

    if sanitized.trim().is_empty() {
        "download.bin".to_owned()
    } else {
        sanitized
    }
}

fn is_allowed_external_url(url: &str) -> bool {
    let normalized = url.trim().to_ascii_lowercase();

    ALLOWED_EXTERNAL_URL_PREFIXES
        .iter()
        .any(|prefix| normalized.starts_with(prefix))
}

fn open_url_with_system_handler(url: &str) -> Result<(), String> {
    let trimmed = url.trim();

    if trimmed.is_empty() {
        return Err("URL is empty.".into());
    }
    if !is_allowed_external_url(trimmed) {
        return Err("Unsupported URL scheme.".into());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("rundll32")
            .arg("url.dll,FileProtocolHandler")
            .arg(trimmed)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("failed to open URL: {error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(trimmed)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("failed to open URL: {error}"))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("failed to open URL: {error}"))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Current desktop platform is not supported.".into())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    open_url_with_system_handler(&url)
}

#[tauri::command]
fn save_downloaded_file(request: SaveDownloadedFileRequest) -> Result<bool, String> {
    let file_name = sanitize_download_file_name(&request.file_name);
    let file_bytes = BASE64_STANDARD
        .decode(request.data_base64.trim())
        .map_err(|error| format!("failed to decode file data: {error}"))?;

    let save_path = rfd::FileDialog::new().set_file_name(&file_name).save_file();
    let Some(save_path) = save_path else {
        return Ok(false);
    };

    fs::write(&save_path, file_bytes)
        .map_err(|error| format!("failed to save file: {error}"))?;

    Ok(true)
}

#[tauri::command]
fn desktop_notification_permission_state(app: AppHandle) -> Result<String, String> {
    app.notification()
        .permission_state()
        .map(|state| map_notification_permission(state).to_owned())
        .map_err(|error| format!("failed to get notification permission: {error}"))
}

#[tauri::command]
fn request_desktop_notification_permission(app: AppHandle) -> Result<String, String> {
    app.notification()
        .request_permission()
        .map(|state| map_notification_permission(state).to_owned())
        .map_err(|error| format!("failed to request notification permission: {error}"))
}

#[tauri::command]
fn send_desktop_notification(
    app: AppHandle,
    payload: DesktopNotificationPayload,
) -> Result<(), String> {
    let mut builder = app.notification().builder().title(payload.title);

    if let Some(body) = payload.body {
        builder = builder.body(body);
    }

    if payload.silent.unwrap_or(false) {
        #[cfg(any(target_os = "android", target_os = "ios"))]
        {
            builder = builder.silent(true);
        }
    }

    builder
        .show()
        .map_err(|error| format!("failed to show notification: {error}"))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            desktop_media_cache::cache_desktop_media_asset,
            desktop_media_cache::read_desktop_media_asset,
            desktop_media_cache::prepare_desktop_media_asset_runtime_file,
            desktop_media_cache::clear_desktop_media_runtime_cache,
            open_external_url,
            save_downloaded_file,
            desktop_notification_permission_state,
            request_desktop_notification_permission,
            send_desktop_notification
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

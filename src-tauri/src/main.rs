#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop_media_cache;

use serde::Deserialize;
use std::process::Command;
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

fn map_notification_permission(state: PermissionState) -> &'static str {
    match state {
        PermissionState::Granted => "granted",
        PermissionState::Denied => "denied",
        PermissionState::Prompt | PermissionState::PromptWithRationale => "prompt",
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
            open_external_url,
            desktop_notification_permission_state,
            request_desktop_notification_permission,
            send_desktop_notification
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop_media_cache;

use std::process::Command;

const ALLOWED_EXTERNAL_URL_PREFIXES: [&str; 5] =
    ["http://", "https://", "mailto:", "ftp://", "magnet:"];

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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            desktop_media_cache::cache_desktop_media_asset,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

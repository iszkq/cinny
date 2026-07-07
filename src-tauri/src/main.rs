#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop_media_cache;

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine};
use reqwest::{
    header::{ACCEPT, CONTENT_TYPE},
    Client, Proxy, Url,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    env, fs,
    process::Command,
    sync::{
        atomic::{AtomicU64, Ordering},
        OnceLock,
    },
    time::Duration,
};
use tauri::{
    plugin::PermissionState, AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_notification::NotificationExt;

#[cfg(target_os = "windows")]
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

const ALLOWED_EXTERNAL_URL_PREFIXES: [&str; 5] =
    ["http://", "https://", "mailto:", "ftp://", "magnet:"];
const REMOTE_STICKER_INDEX_HOST: &str = "image.527012.xyz";
const REMOTE_STICKER_INDEX_PATH: &str = "/index.json";
const REMOTE_STICKER_INDEX_MAX_BYTES: u64 = 25 * 1024 * 1024;
const REMOTE_STICKER_MEDIA_MAX_BYTES: u64 = 25 * 1024 * 1024;
static REMOTE_STICKER_HTTP_CLIENT: OnceLock<Client> = OnceLock::new();
static EXTERNAL_POPUP_COUNTER: AtomicU64 = AtomicU64::new(1);

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteStickerMediaResponse {
    data_base64: String,
    mime_type: Option<String>,
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

fn is_allowed_external_window_label(label: &str) -> bool {
    label.starts_with("cinny-external-")
        && label.len() <= 96
        && label
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
}

fn sanitize_window_title(title: &str) -> String {
    let sanitized = title
        .trim()
        .chars()
        .filter(|ch| !ch.is_control())
        .take(120)
        .collect::<String>();

    if sanitized.is_empty() {
        "Meeting".to_owned()
    } else {
        sanitized
    }
}

fn parse_external_webview_url(url: &str) -> Result<Url, String> {
    let parsed = Url::parse(url.trim()).map_err(|error| format!("invalid URL: {error}"))?;

    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        _ => Err("Unsupported URL scheme.".into()),
    }
}

fn is_allowed_external_popup_url(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "about")
}

fn next_external_popup_label(parent_label: &str) -> String {
    let next_id = EXTERNAL_POPUP_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{parent_label}-popup-{next_id}")
}

fn get_remote_sticker_http_client() -> &'static Client {
    REMOTE_STICKER_HTTP_CLIENT.get_or_init(|| {
        let mut builder = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30));

        if let Some(proxy_url) = detect_desktop_updater_proxy() {
            if let Ok(proxy) = Proxy::all(&proxy_url) {
                builder = builder.proxy(proxy);
            }
        }

        builder.build().unwrap_or_else(|_| Client::new())
    })
}

fn parse_remote_sticker_index_url(url: &str) -> Result<Url, String> {
    let parsed = Url::parse(url.trim())
        .map_err(|error| format!("invalid sticker index URL: {error}"))?;
    let valid_origin =
        parsed.scheme() == "https" && parsed.host_str() == Some(REMOTE_STICKER_INDEX_HOST);
    let valid_path = parsed.path() == REMOTE_STICKER_INDEX_PATH;
    let valid_port = parsed.port().is_none() || parsed.port() == Some(443);
    let no_credentials = parsed.username().is_empty() && parsed.password().is_none();

    if valid_origin && valid_path && valid_port && no_credentials {
        Ok(parsed)
    } else {
        Err("unsupported sticker index URL.".into())
    }
}

fn parse_remote_sticker_media_url(url: &str) -> Result<Url, String> {
    let parsed = Url::parse(url.trim())
        .map_err(|error| format!("invalid sticker media URL: {error}"))?;
    let valid_origin =
        parsed.scheme() == "https" && parsed.host_str() == Some(REMOTE_STICKER_INDEX_HOST);
    let valid_port = parsed.port().is_none() || parsed.port() == Some(443);
    let no_credentials = parsed.username().is_empty() && parsed.password().is_none();
    let has_path = !parsed.path().is_empty() && parsed.path() != "/";

    if valid_origin && valid_port && no_credentials && has_path {
        Ok(parsed)
    } else {
        Err("unsupported sticker media URL.".into())
    }
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

fn normalize_proxy_url(proxy_value: &str, scheme_hint: &str) -> Option<String> {
    let trimmed = proxy_value.trim().trim_matches('"');
    if trimmed.is_empty() {
        return None;
    }

    if let Ok(parsed) = reqwest::Url::parse(trimmed) {
        return Some(parsed.to_string());
    }

    let scheme_prefix = match scheme_hint {
        "socks" | "socks4" | "socks5" => "socks5://",
        _ => "http://",
    };
    let candidate = format!("{scheme_prefix}{trimmed}");
    reqwest::Url::parse(&candidate)
        .ok()
        .map(|parsed| parsed.to_string())
}

fn detect_updater_proxy_from_env() -> Option<String> {
    [
        "HTTPS_PROXY",
        "https_proxy",
        "ALL_PROXY",
        "all_proxy",
        "HTTP_PROXY",
        "http_proxy",
    ]
    .iter()
    .find_map(|key| env::var(key).ok())
    .and_then(|value| normalize_proxy_url(&value, "http"))
}

#[cfg(target_os = "windows")]
fn parse_windows_proxy_server(proxy_server: &str) -> Option<String> {
    let mut https_proxy = None;
    let mut http_proxy = None;
    let mut socks_proxy = None;
    let mut fallback_proxy = None;

    for segment in proxy_server.split(';').map(str::trim).filter(|item| !item.is_empty()) {
        if let Some((raw_kind, raw_value)) = segment.split_once('=') {
            let kind = raw_kind.trim().to_ascii_lowercase();
            let value = raw_value.trim();
            let parsed = match kind.as_str() {
                "https" => normalize_proxy_url(value, "http"),
                "http" => normalize_proxy_url(value, "http"),
                "socks" | "socks4" | "socks5" => normalize_proxy_url(value, "socks5"),
                _ => normalize_proxy_url(value, "http"),
            };

            match kind.as_str() {
                "https" if https_proxy.is_none() => https_proxy = parsed,
                "http" if http_proxy.is_none() => http_proxy = parsed,
                "socks" | "socks4" | "socks5" if socks_proxy.is_none() => socks_proxy = parsed,
                _ if fallback_proxy.is_none() => fallback_proxy = parsed,
                _ => {}
            }
        } else if fallback_proxy.is_none() {
            fallback_proxy = normalize_proxy_url(segment, "http");
        }
    }

    https_proxy
        .or(http_proxy)
        .or(socks_proxy)
        .or(fallback_proxy)
}

#[cfg(target_os = "windows")]
fn detect_updater_proxy_from_windows_registry() -> Option<String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let internet_settings = hkcu
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        .ok()?;
    let proxy_enabled = internet_settings.get_value::<u32, _>("ProxyEnable").unwrap_or(0);
    if proxy_enabled == 0 {
        return None;
    }

    let proxy_server = internet_settings.get_value::<String, _>("ProxyServer").ok()?;
    parse_windows_proxy_server(&proxy_server)
}

fn detect_desktop_updater_proxy() -> Option<String> {
    detect_updater_proxy_from_env().or_else(|| {
        #[cfg(target_os = "windows")]
        {
            detect_updater_proxy_from_windows_registry()
        }

        #[cfg(not(target_os = "windows"))]
        {
            None
        }
    })
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    open_url_with_system_handler(&url)
}

#[tauri::command]
async fn open_external_url_window(
    app: AppHandle,
    url: String,
    label: String,
    title: String,
) -> Result<(), String> {
    if !is_allowed_external_window_label(&label) {
        return Err("Unsupported window label.".into());
    }

    let parsed = parse_external_webview_url(&url)?;
    let title = sanitize_window_title(&title);

    if let Some(existing_window) = app.get_webview_window(&label) {
        existing_window
            .set_title(&title)
            .map_err(|error| format!("failed to update window title: {error}"))?;
        let _ = existing_window.unminimize();
        let _ = existing_window.show();
        let _ = existing_window.set_focus();
        return Ok(());
    }

    let popup_app = app.clone();
    let popup_parent_label = label.clone();

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(&title)
        .inner_size(1180.0, 820.0)
        .min_inner_size(720.0, 520.0)
        .resizable(true)
        .center()
        .focused(true)
        .visible(true)
        .disable_drag_drop_handler()
        .on_new_window(move |url, features| {
            if !is_allowed_external_popup_url(&url) {
                let _ = open_url_with_system_handler(url.as_str());
                return tauri::webview::NewWindowResponse::Deny;
            }

            let popup_label = next_external_popup_label(&popup_parent_label);
            let popup_url = Url::parse("about:blank").expect("about:blank is a valid URL");
            let popup_builder = WebviewWindowBuilder::new(
                &popup_app,
                popup_label,
                WebviewUrl::External(popup_url),
            )
            .window_features(features)
            .title(url.as_str())
            .resizable(true)
            .focused(true)
            .visible(true)
            .disable_drag_drop_handler()
            .on_document_title_changed(|window, title| {
                let _ = window.set_title(&title);
            });

            match popup_builder.build() {
                Ok(window) => tauri::webview::NewWindowResponse::Create { window },
                Err(_) => {
                    let _ = open_url_with_system_handler(url.as_str());
                    tauri::webview::NewWindowResponse::Deny
                }
            }
        })
        .on_document_title_changed(|window, title| {
            let _ = window.set_title(&title);
        })
        .build()
        .map(|_| ())
        .map_err(|error| format!("failed to create external window: {error}"))
}

#[tauri::command]
fn get_desktop_updater_proxy() -> Option<String> {
    detect_desktop_updater_proxy()
}

#[tauri::command]
async fn fetch_remote_sticker_index(url: String) -> Result<Value, String> {
    let parsed = parse_remote_sticker_index_url(&url)?;
    let response = get_remote_sticker_http_client()
        .get(parsed)
        .header(ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| format!("failed to fetch remote sticker index: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("failed to fetch remote sticker index: HTTP {status}"));
    }

    if response
        .content_length()
        .is_some_and(|size| size > REMOTE_STICKER_INDEX_MAX_BYTES)
    {
        return Err("remote sticker index is too large.".into());
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("failed to read remote sticker index: {error}"))?;

    if bytes.len() as u64 > REMOTE_STICKER_INDEX_MAX_BYTES {
        return Err("remote sticker index is too large.".into());
    }

    serde_json::from_slice::<Value>(&bytes)
        .map_err(|error| format!("failed to parse remote sticker index JSON: {error}"))
}

#[tauri::command]
async fn fetch_remote_sticker_media(url: String) -> Result<RemoteStickerMediaResponse, String> {
    let parsed = parse_remote_sticker_media_url(&url)?;
    let response = get_remote_sticker_http_client()
        .get(parsed)
        .header(ACCEPT, "image/*,*/*;q=0.8")
        .send()
        .await
        .map_err(|error| format!("failed to fetch remote sticker media: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("failed to fetch remote sticker media: HTTP {status}"));
    }

    if response
        .content_length()
        .is_some_and(|size| size > REMOTE_STICKER_MEDIA_MAX_BYTES)
    {
        return Err("remote sticker media is too large.".into());
    }

    let mime_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("failed to read remote sticker media: {error}"))?;

    if bytes.len() as u64 > REMOTE_STICKER_MEDIA_MAX_BYTES {
        return Err("remote sticker media is too large.".into());
    }

    Ok(RemoteStickerMediaResponse {
        data_base64: BASE64_STANDARD.encode(&bytes),
        mime_type,
    })
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
            desktop_media_cache::prepare_desktop_media_asset_runtime_file,
            desktop_media_cache::clear_desktop_media_runtime_cache,
            desktop_media_cache::clear_desktop_media_cache,
            open_external_url,
            open_external_url_window,
            get_desktop_updater_proxy,
            fetch_remote_sticker_index,
            fetch_remote_sticker_media,
            save_downloaded_file,
            desktop_notification_permission_state,
            request_desktop_notification_permission,
            send_desktop_notification
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

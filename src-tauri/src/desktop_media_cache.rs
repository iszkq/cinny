use std::fs;
use std::path::{Path, PathBuf};

use mime_guess::get_mime_extensions_str;
use reqwest::header::CONTENT_TYPE;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

const MEDIA_CACHE_ROOT_DIR: &str = "emoji-media-cache";
const MEDIA_FILE_PREFIX: &str = "media.";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopMediaCacheRequest {
    pub source_url: String,
    pub account_key: String,
    pub mime_type: Option<String>,
}

fn hash_string(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn normalize_account_key(account_key: &str) -> String {
    account_key.trim().to_lowercase()
}

fn normalize_source_url(source_url: &str) -> String {
    match reqwest::Url::parse(source_url) {
        Ok(mut parsed) => {
            let mut query_pairs: Vec<(String, String)> = parsed
                .query_pairs()
                .filter(|(key, _)| key != "access_token")
                .map(|(key, value)| (key.into_owned(), value.into_owned()))
                .collect();
            query_pairs.sort();

            parsed.set_query(None);
            if !query_pairs.is_empty() {
                let mut serializer = parsed.query_pairs_mut();
                for (key, value) in query_pairs {
                    serializer.append_pair(&key, &value);
                }
            }

            parsed.to_string()
        }
        Err(_) => source_url.to_owned(),
    }
}

fn sanitize_path_segment(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect::<String>();

    let trimmed = sanitized.trim_matches('_');
    if trimmed.is_empty() {
        "account".to_owned()
    } else {
        trimmed.to_owned()
    }
}

fn build_account_dir_name(account_key: &str) -> String {
    let normalized = normalize_account_key(account_key);
    let readable_prefix = sanitize_path_segment(&normalized);
    let short_hash = &hash_string(&normalized)[..12];
    format!("{readable_prefix}__{short_hash}")
}

fn get_cache_root(app: &AppHandle) -> Result<PathBuf, String> {
    let app_local_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("failed to resolve desktop media cache directory: {error}"))?;

    Ok(app_local_data_dir.join(MEDIA_CACHE_ROOT_DIR))
}

fn get_asset_dir(root: &Path, account_key: &str, source_url: &str) -> PathBuf {
    let normalized_source_url = normalize_source_url(source_url);
    root.join(build_account_dir_name(account_key))
        .join(hash_string(&normalized_source_url))
}

fn find_cached_media_file(asset_dir: &Path) -> Result<Option<PathBuf>, String> {
    if !asset_dir.exists() {
        return Ok(None);
    }

    let read_dir = fs::read_dir(asset_dir)
        .map_err(|error| format!("failed to read cached media directory: {error}"))?;

    for entry in read_dir {
        let entry = entry.map_err(|error| format!("failed to inspect cached media file: {error}"))?;
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();

        if file_name.starts_with(MEDIA_FILE_PREFIX) && !file_name.ends_with(".download") {
            return Ok(Some(entry.path()));
        }
    }

    Ok(None)
}

fn extension_from_url(source_url: &str) -> Option<String> {
    reqwest::Url::parse(source_url)
        .ok()
        .and_then(|parsed| {
            Path::new(parsed.path())
                .extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.to_ascii_lowercase())
        })
}

fn normalize_mime_type(value: &str) -> &str {
    value.split(';').next().map(str::trim).unwrap_or(value)
}

fn extension_from_mime_type(mime_type: &str) -> Option<String> {
    get_mime_extensions_str(normalize_mime_type(mime_type))
        .and_then(|extensions| extensions.first().copied())
        .map(str::to_owned)
}

fn resolve_media_extension(
    source_url: &str,
    response_mime_type: Option<&str>,
    request_mime_type: Option<&str>,
) -> String {
    response_mime_type
        .and_then(extension_from_mime_type)
        .or_else(|| request_mime_type.and_then(extension_from_mime_type))
        .or_else(|| extension_from_url(source_url))
        .unwrap_or_else(|| "bin".to_owned())
}

#[tauri::command]
pub async fn cache_desktop_media_asset(
    app: AppHandle,
    request: DesktopMediaCacheRequest,
) -> Result<String, String> {
    let source_url = request.source_url.trim();
    if source_url.is_empty() {
        return Err("sourceUrl is required".to_owned());
    }

    let root = get_cache_root(&app)?;
    let asset_dir = get_asset_dir(&root, &request.account_key, source_url);

    fs::create_dir_all(&asset_dir)
        .map_err(|error| format!("failed to create desktop media cache directory: {error}"))?;

    if let Some(cached_file) = find_cached_media_file(&asset_dir)? {
        return Ok(cached_file.to_string_lossy().into_owned());
    }

    let response = reqwest::Client::new()
        .get(source_url)
        .send()
        .await
        .map_err(|error| format!("failed to download desktop media asset: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "failed to download desktop media asset: HTTP {}",
            response.status()
        ));
    }

    let response_mime_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let media_bytes = response
        .bytes()
        .await
        .map_err(|error| format!("failed to read desktop media response bytes: {error}"))?;

    let extension = resolve_media_extension(
        source_url,
        response_mime_type.as_deref(),
        request.mime_type.as_deref(),
    );
    let cached_file = asset_dir.join(format!("{MEDIA_FILE_PREFIX}{extension}"));
    let temp_file = asset_dir.join(format!("{MEDIA_FILE_PREFIX}{extension}.download"));

    if cached_file.exists() {
        let _ = fs::remove_file(&cached_file);
    }

    fs::write(&temp_file, &media_bytes)
        .map_err(|error| format!("failed to write desktop media cache file: {error}"))?;
    fs::rename(&temp_file, &cached_file).map_err(|error| {
        let _ = fs::remove_file(&temp_file);
        format!("failed to finalize desktop media cache file: {error}")
    })?;

    Ok(cached_file.to_string_lossy().into_owned())
}

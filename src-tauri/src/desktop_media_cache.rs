use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine};
use mime_guess::from_path;
use rand::rngs::OsRng;
use rand::RngCore;
use reqwest::header::CONTENT_TYPE;
use reqwest::{Client, Response, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

const MEDIA_CACHE_ROOT_DIR: &str = "desktop-media-cache-v2";
const MEDIA_RUNTIME_ROOT_DIR: &str = "desktop-media-runtime-v1";
const MEDIA_FILE_NAME: &str = "media.enc";
const MEDIA_FILE_TEMP_NAME: &str = "media.enc.download";
const MEDIA_METADATA_FILE_NAME: &str = "metadata.json";
const MEDIA_METADATA_TEMP_FILE_NAME: &str = "metadata.json.download";
const MEDIA_CACHE_KEY_CONTEXT: &str = "cinny-desktop-media-cache-v1";
const MEDIA_CACHE_NONCE_SIZE: usize = 12;
static MEDIA_HTTP_CLIENT: OnceLock<Client> = OnceLock::new();
static MEDIA_RUNTIME_CACHE_RESET: OnceLock<()> = OnceLock::new();

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopMediaCacheRequest {
    pub source_url: String,
    pub account_key: String,
    pub access_token: Option<String>,
    pub mime_type: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopMediaAssetPayload {
    pub data_base64: String,
    pub mime_type: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopMediaRuntimeAsset {
    pub file_path: String,
    pub mime_type: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CachedMediaMetadata {
    version: u8,
    mime_type: Option<String>,
}

struct CachedMediaAsset {
    bytes: Vec<u8>,
    mime_type: Option<String>,
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
    match Url::parse(source_url) {
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

fn remove_allow_redirect_param(source_url: &str) -> String {
    match Url::parse(source_url) {
        Ok(mut parsed) => {
            let mut query_pairs: Vec<(String, String)> = parsed
                .query_pairs()
                .filter(|(key, _)| key != "allow_redirect")
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

fn get_runtime_cache_root(app: &AppHandle) -> Result<PathBuf, String> {
    let app_local_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| {
            format!("failed to resolve desktop media runtime cache directory: {error}")
        })?;

    Ok(app_local_data_dir.join(MEDIA_RUNTIME_ROOT_DIR))
}

fn get_media_http_client() -> &'static Client {
    MEDIA_HTTP_CLIENT.get_or_init(Client::new)
}

fn get_asset_dir(root: &Path, account_key: &str, source_url: &str) -> PathBuf {
    let normalized_source_url = normalize_source_url(source_url);
    root.join(build_account_dir_name(account_key))
        .join(hash_string(&normalized_source_url))
}

fn reset_runtime_cache_root_once(root: &Path) {
    if MEDIA_RUNTIME_CACHE_RESET.get().is_some() {
        return;
    }

    if root.exists() {
        let _ = fs::remove_dir_all(root);
    }

    let _ = MEDIA_RUNTIME_CACHE_RESET.set(());
}

fn get_media_file_path(asset_dir: &Path) -> PathBuf {
    asset_dir.join(MEDIA_FILE_NAME)
}

fn get_media_temp_file_path(asset_dir: &Path) -> PathBuf {
    asset_dir.join(MEDIA_FILE_TEMP_NAME)
}

fn get_metadata_file_path(asset_dir: &Path) -> PathBuf {
    asset_dir.join(MEDIA_METADATA_FILE_NAME)
}

fn get_metadata_temp_file_path(asset_dir: &Path) -> PathBuf {
    asset_dir.join(MEDIA_METADATA_TEMP_FILE_NAME)
}

fn get_runtime_media_file_path(asset_dir: &Path, mime_type: Option<&str>) -> PathBuf {
    asset_dir.join(format!("media.{}", extension_for_mime_type(mime_type)))
}

fn clear_cached_asset_dir(asset_dir: &Path) {
    if asset_dir.exists() {
        let _ = fs::remove_dir_all(asset_dir);
    }
}

fn clear_runtime_cache_root(root: &Path) {
    if root.exists() {
        let _ = fs::remove_dir_all(root);
    }
}

fn normalize_mime_type(value: &str) -> &str {
    value.split(';').next().map(str::trim).unwrap_or(value)
}

fn normalize_cached_mime_type(value: Option<&str>) -> Option<String> {
    value
        .map(normalize_mime_type)
        .map(str::trim)
        .filter(|mime_type| !mime_type.is_empty())
        .map(str::to_owned)
}

fn mime_type_from_url(source_url: &str) -> Option<String> {
    Url::parse(source_url)
        .ok()
        .and_then(|parsed| from_path(parsed.path()).first_raw().map(str::to_owned))
}

fn extension_for_mime_type(mime_type: Option<&str>) -> &'static str {
    match normalize_cached_mime_type(mime_type).as_deref() {
        Some("image/png") => "png",
        Some("image/jpeg") => "jpg",
        Some("image/gif") => "gif",
        Some("image/webp") => "webp",
        Some("image/avif") => "avif",
        Some("image/svg+xml") => "svg",
        Some("image/bmp") => "bmp",
        Some("image/x-icon") | Some("image/vnd.microsoft.icon") => "ico",
        Some("video/mp4") => "mp4",
        Some("video/webm") => "webm",
        Some("audio/mpeg") => "mp3",
        Some("audio/ogg") => "ogg",
        Some("audio/webm") => "webm",
        Some("audio/wav") => "wav",
        Some("application/pdf") => "pdf",
        _ => "bin",
    }
}

fn resolve_media_mime_type(
    source_url: &str,
    response_mime_type: Option<&str>,
    request_mime_type: Option<&str>,
) -> Option<String> {
    normalize_cached_mime_type(response_mime_type)
        .or_else(|| normalize_cached_mime_type(request_mime_type))
        .or_else(|| mime_type_from_url(source_url))
}

fn derive_encryption_key(account_key: &str, access_token: Option<&str>) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(MEDIA_CACHE_KEY_CONTEXT.as_bytes());
    hasher.update([0u8]);
    hasher.update(normalize_account_key(account_key).as_bytes());
    hasher.update([0u8]);
    hasher.update(access_token.unwrap_or("").trim().as_bytes());

    let digest = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&digest);
    key
}

fn get_media_cipher(
    account_key: &str,
    access_token: Option<&str>,
) -> Result<Aes256Gcm, String> {
    Aes256Gcm::new_from_slice(&derive_encryption_key(account_key, access_token))
        .map_err(|error| format!("failed to derive desktop media encryption key: {error:?}"))
}

fn encrypt_media_bytes(
    media_bytes: &[u8],
    account_key: &str,
    access_token: Option<&str>,
) -> Result<Vec<u8>, String> {
    let cipher = get_media_cipher(account_key, access_token)?;
    let mut nonce_bytes = [0u8; MEDIA_CACHE_NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce_bytes);

    let encrypted_bytes = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), media_bytes)
        .map_err(|error| format!("failed to encrypt desktop media cache bytes: {error:?}"))?;

    let mut stored_bytes = nonce_bytes.to_vec();
    stored_bytes.extend_from_slice(&encrypted_bytes);
    Ok(stored_bytes)
}

fn decrypt_media_bytes(
    encrypted_bytes: &[u8],
    account_key: &str,
    access_token: Option<&str>,
) -> Result<Vec<u8>, String> {
    if encrypted_bytes.len() <= MEDIA_CACHE_NONCE_SIZE {
        return Err("desktop media cache payload is truncated".to_owned());
    }

    let (nonce_bytes, ciphertext) = encrypted_bytes.split_at(MEDIA_CACHE_NONCE_SIZE);
    let cipher = get_media_cipher(account_key, access_token)?;

    cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|error| format!("failed to decrypt desktop media cache bytes: {error:?}"))
}

fn read_cached_media_asset(
    asset_dir: &Path,
    account_key: &str,
    access_token: Option<&str>,
) -> Result<Option<CachedMediaAsset>, String> {
    let media_file = get_media_file_path(asset_dir);
    let metadata_file = get_metadata_file_path(asset_dir);

    if !media_file.exists() || !metadata_file.exists() {
        return Ok(None);
    }

    let metadata_bytes = match fs::read(&metadata_file) {
        Ok(bytes) => bytes,
        Err(_) => {
            clear_cached_asset_dir(asset_dir);
            return Ok(None);
        }
    };
    let metadata = match serde_json::from_slice::<CachedMediaMetadata>(&metadata_bytes) {
        Ok(metadata) if metadata.version == 1 => metadata,
        _ => {
            clear_cached_asset_dir(asset_dir);
            return Ok(None);
        }
    };

    let encrypted_bytes = match fs::read(&media_file) {
        Ok(bytes) => bytes,
        Err(_) => {
            clear_cached_asset_dir(asset_dir);
            return Ok(None);
        }
    };

    let media_bytes = match decrypt_media_bytes(&encrypted_bytes, account_key, access_token) {
        Ok(bytes) => bytes,
        Err(_) => {
            clear_cached_asset_dir(asset_dir);
            return Ok(None);
        }
    };

    Ok(Some(CachedMediaAsset {
        bytes: media_bytes,
        mime_type: metadata.mime_type,
    }))
}

fn write_cached_media_asset(
    asset_dir: &Path,
    account_key: &str,
    access_token: Option<&str>,
    media_bytes: &[u8],
    mime_type: Option<&str>,
) -> Result<(), String> {
    fs::create_dir_all(asset_dir)
        .map_err(|error| format!("failed to create desktop media cache directory: {error}"))?;

    let encrypted_bytes = encrypt_media_bytes(media_bytes, account_key, access_token)?;
    let metadata = CachedMediaMetadata {
        version: 1,
        mime_type: normalize_cached_mime_type(mime_type),
    };
    let metadata_bytes = serde_json::to_vec(&metadata)
        .map_err(|error| format!("failed to serialize desktop media cache metadata: {error}"))?;

    let media_temp_file = get_media_temp_file_path(asset_dir);
    let media_file = get_media_file_path(asset_dir);
    let metadata_temp_file = get_metadata_temp_file_path(asset_dir);
    let metadata_file = get_metadata_file_path(asset_dir);

    fs::write(&media_temp_file, &encrypted_bytes)
        .map_err(|error| format!("failed to write encrypted desktop media cache file: {error}"))?;
    fs::rename(&media_temp_file, &media_file).map_err(|error| {
        let _ = fs::remove_file(&media_temp_file);
        format!("failed to finalize encrypted desktop media cache file: {error}")
    })?;

    fs::write(&metadata_temp_file, &metadata_bytes)
        .map_err(|error| format!("failed to write desktop media cache metadata: {error}"))?;
    fs::rename(&metadata_temp_file, &metadata_file).map_err(|error| {
        let _ = fs::remove_file(&metadata_temp_file);
        format!("failed to finalize desktop media cache metadata: {error}")
    })?;

    Ok(())
}

fn ensure_runtime_media_asset(
    app: &AppHandle,
    request: &DesktopMediaCacheRequest,
    asset: &CachedMediaAsset,
) -> Result<DesktopMediaRuntimeAsset, String> {
    let runtime_root = get_runtime_cache_root(app)?;
    reset_runtime_cache_root_once(&runtime_root);

    let asset_dir = get_asset_dir(&runtime_root, &request.account_key, &request.source_url);
    let runtime_file = get_runtime_media_file_path(&asset_dir, asset.mime_type.as_deref());

    if runtime_file.exists() {
        return Ok(DesktopMediaRuntimeAsset {
            file_path: runtime_file.to_string_lossy().to_string(),
            mime_type: asset.mime_type.clone(),
        });
    }

    clear_cached_asset_dir(&asset_dir);
    fs::create_dir_all(&asset_dir).map_err(|error| {
        format!("failed to create desktop media runtime cache directory: {error}")
    })?;

    let runtime_extension = extension_for_mime_type(asset.mime_type.as_deref());
    let temp_runtime_file = asset_dir.join(format!("media.{runtime_extension}.download"));

    fs::write(&temp_runtime_file, &asset.bytes)
        .map_err(|error| format!("failed to write desktop media runtime file: {error}"))?;
    fs::rename(&temp_runtime_file, &runtime_file).map_err(|error| {
        let _ = fs::remove_file(&temp_runtime_file);
        format!("failed to finalize desktop media runtime file: {error}")
    })?;

    Ok(DesktopMediaRuntimeAsset {
        file_path: runtime_file.to_string_lossy().to_string(),
        mime_type: asset.mime_type.clone(),
    })
}

fn build_media_fallback_urls(source_url: &str) -> Vec<String> {
    const AUTH_MEDIA_FALLBACKS: [(&str, [&str; 2]); 2] = [
        (
            "/_matrix/client/v1/media/download",
            ["/_matrix/media/v3/download", "/_matrix/media/r0/download"],
        ),
        (
            "/_matrix/client/v1/media/thumbnail",
            ["/_matrix/media/v3/thumbnail", "/_matrix/media/r0/thumbnail"],
        ),
    ];

    let Ok(parsed) = Url::parse(source_url) else {
        return Vec::new();
    };
    let path = parsed.path().to_owned();

    AUTH_MEDIA_FALLBACKS
        .iter()
        .find_map(|(auth_path, fallback_paths)| {
            path.strip_prefix(auth_path).map(|path_suffix| {
                fallback_paths
                    .iter()
                    .map(|fallback_path| {
                        let mut fallback_url = parsed.clone();
                        fallback_url.set_path(&format!("{fallback_path}{path_suffix}"));
                        fallback_url.to_string()
                    })
                    .collect::<Vec<_>>()
            })
        })
        .unwrap_or_default()
}

fn build_media_request_urls(source_url: &str) -> Vec<String> {
    let stripped_source_url = remove_allow_redirect_param(source_url);
    let mut request_urls = vec![source_url.to_owned()];

    if stripped_source_url != source_url {
        request_urls.push(stripped_source_url.clone());
    }

    request_urls.extend(build_media_fallback_urls(source_url));
    request_urls.extend(build_media_fallback_urls(&stripped_source_url));

    let mut unique_urls = Vec::new();
    for request_url in request_urls {
        if !unique_urls.contains(&request_url) {
            unique_urls.push(request_url);
        }
    }

    unique_urls
}

async fn send_media_request(
    client: &Client,
    source_url: &str,
    access_token: Option<&str>,
) -> Result<Response, String> {
    let request = client.get(source_url);
    let request =
        if let Some(access_token) = access_token.filter(|token| !token.trim().is_empty()) {
            request.bearer_auth(access_token)
        } else {
            request
        };

    request
        .send()
        .await
        .map_err(|error| format!("failed to download desktop media asset: {error}"))
}

async fn fetch_media_response(
    client: &Client,
    source_url: &str,
    access_token: Option<&str>,
) -> Result<Response, String> {
    let request_urls = build_media_request_urls(source_url);
    let stripped_source_url = remove_allow_redirect_param(source_url);
    let mut last_status = None;
    let mut last_error: Option<String> = None;

    for request_url in request_urls {
        let request_tokens = if request_url == source_url || request_url == stripped_source_url {
            if access_token.is_some() {
                vec![access_token, None]
            } else {
                vec![None]
            }
        } else {
            vec![None]
        };

        for request_token in request_tokens {
            match send_media_request(client, &request_url, request_token).await {
                Ok(response) => {
                    if response.status().is_success() {
                        return Ok(response);
                    }
                    last_status = Some(response.status());
                }
                Err(error) => {
                    last_error = Some(error);
                }
            }
        }
    }

    match last_status {
        Some(status) => Err(format!(
            "failed to download desktop media asset: HTTP {}",
            status
        )),
        None => Err(
            last_error.unwrap_or_else(|| "failed to download desktop media asset".to_owned())
        ),
    }
}

async fn ensure_cached_media_asset(
    app: &AppHandle,
    request: &DesktopMediaCacheRequest,
) -> Result<CachedMediaAsset, String> {
    let source_url = request.source_url.trim();
    if source_url.is_empty() {
        return Err("sourceUrl is required".to_owned());
    }

    let root = get_cache_root(app)?;
    let asset_dir = get_asset_dir(&root, &request.account_key, source_url);

    if let Some(cached_asset) = read_cached_media_asset(
        &asset_dir,
        &request.account_key,
        request.access_token.as_deref(),
    )? {
        return Ok(cached_asset);
    }

    let client = get_media_http_client();
    let response = fetch_media_response(client, source_url, request.access_token.as_deref()).await?;

    let response_mime_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let media_bytes = response
        .bytes()
        .await
        .map_err(|error| format!("failed to read desktop media response bytes: {error}"))?;
    let resolved_mime_type = resolve_media_mime_type(
        source_url,
        response_mime_type.as_deref(),
        request.mime_type.as_deref(),
    );

    write_cached_media_asset(
        &asset_dir,
        &request.account_key,
        request.access_token.as_deref(),
        &media_bytes,
        resolved_mime_type.as_deref(),
    )?;

    Ok(CachedMediaAsset {
        bytes: media_bytes.to_vec(),
        mime_type: resolved_mime_type,
    })
}

#[tauri::command]
pub async fn cache_desktop_media_asset(
    app: AppHandle,
    request: DesktopMediaCacheRequest,
) -> Result<bool, String> {
    ensure_cached_media_asset(&app, &request).await.map(|_| true)
}

#[tauri::command]
pub async fn read_desktop_media_asset(
    app: AppHandle,
    request: DesktopMediaCacheRequest,
) -> Result<DesktopMediaAssetPayload, String> {
    let asset = ensure_cached_media_asset(&app, &request).await?;

    Ok(DesktopMediaAssetPayload {
        data_base64: BASE64_STANDARD.encode(&asset.bytes),
        mime_type: asset.mime_type,
    })
}

#[tauri::command]
pub async fn prepare_desktop_media_asset_runtime_file(
    app: AppHandle,
    request: DesktopMediaCacheRequest,
) -> Result<DesktopMediaRuntimeAsset, String> {
    let asset = ensure_cached_media_asset(&app, &request).await?;
    ensure_runtime_media_asset(&app, &request, &asset)
}

#[tauri::command]
pub fn clear_desktop_media_runtime_cache(app: AppHandle) -> Result<(), String> {
    let runtime_root = get_runtime_cache_root(&app)?;
    clear_runtime_cache_root(&runtime_root);
    Ok(())
}

use reqwest::{redirect::Policy, Client, Url};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRequest {
    endpoint: String,
    api_key: Option<String>,
    body: Option<String>,
}

#[derive(Serialize)]
pub struct AiResponse {
    status: u16,
    body: String,
}

// Only the local main webview can use the user-configured AI transport.
// Native HTTP avoids WebView CORS restrictions for Ollama and compatible servers.
#[tauri::command]
pub async fn request_ai_http(window: tauri::WebviewWindow, request: AiRequest) -> Result<AiResponse, String> {
    if window.label() != "main" {
        return Err("AI requests are only available in the main window".into());
    }
    let url = Url::parse(&request.endpoint).map_err(|_| "AI 接口地址无效")?;
    if !matches!(url.scheme(), "http" | "https") || !url.username().is_empty() || url.password().is_some() {
        return Err("AI 接口必须使用 HTTP 或 HTTPS，且不能在地址中包含密码".into());
    }
    let client = Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(120))
        .build().map_err(|_| "无法创建 AI 网络连接")?;
    let mut req = if let Some(body) = request.body {
        if body.len() > 2 * 1024 * 1024 { return Err("AI 请求过大".into()); }
        client.post(url).header("Content-Type", "application/json").body(body)
    } else { client.get(url) };
    req = req.header("Accept", "application/json");
    if let Some(key) = request.api_key.filter(|key| !key.trim().is_empty()) {
        req = req.bearer_auth(key.trim());
    }
    let mut response = req.send().await.map_err(|_| "无法连接 AI 服务，请检查地址、服务状态和网络")?;
    let status = response.status().as_u16();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "读取 AI 响应失败")? {
        if bytes.len() + chunk.len() > 4 * 1024 * 1024 { return Err("AI 响应过大".into()); }
        bytes.extend_from_slice(&chunk);
    }
    Ok(AiResponse { status, body: String::from_utf8(bytes).map_err(|_| "AI 响应不是 UTF-8 文本")? })
}

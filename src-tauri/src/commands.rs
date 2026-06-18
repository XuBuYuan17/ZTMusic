use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, COOKIE, USER_AGENT};
use serde_json::{json, Value};
use tauri::State;

use crate::{AppState, NativeMediaState, NativeMetadataPayload, NativePendingAction, NativePlaybackPayload, NcmRequest, NcmResponse, APP_USER_AGENT};

/// POST/GET 代理：将前端请求转发到 Netease API，并回传 cookie 变更。
#[tauri::command]
pub async fn ncm_request(
    state: State<'_, AppState>,
    request: NcmRequest,
) -> Result<NcmResponse, String> {
    let mut url = build_api_url(&request.base, &request.endpoint)?;
    let method = request.method.to_uppercase();
    let cookie = request.cookie.as_deref();

    let mut builder = match method.as_str() {
        "GET" => {
            append_query_pairs(&mut url, &request.params, cookie);
            state.client.get(url)
        }
        "POST" => state.client.post(url),
        _ => return Err(format!("Unsupported API method: {method}")),
    };

    builder = builder.header(USER_AGENT, APP_USER_AGENT);

    if let Some(cookie) = cookie.filter(|cookie| !cookie.is_empty()) {
        let value =
            HeaderValue::from_str(cookie).map_err(|error| format!("Invalid cookie: {error}"))?;
        builder = builder.header(COOKIE, value);
    }

    if method == "POST" {
        let form_body = value_to_form_pairs(&request.body.unwrap_or_else(|| json!({})), cookie);
        builder = builder
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .form(&form_body);
    }

    let response = builder
        .send()
        .await
        .map_err(|error| format!("API request failed: {error}"))?;
    let status = response.status();
    let cookie = collect_set_cookie(response.headers());
    let data = response.json::<Value>().await.unwrap_or_else(
        |_| json!({ "code": status.as_u16(), "message": format!("API error: {status}") }),
    );

    if !status.is_success() && !request.allow_error_body.unwrap_or(false) {
        return Err(format!("API error: {status} {data}"));
    }

    Ok(NcmResponse { data, cookie })
}

/// 更新原生媒体元数据（Android 通知栏 / Linux MPRIS）。
#[allow(non_snake_case)]
#[tauri::command]
pub fn updateMetadata(
    state: State<'_, NativeMediaState>,
    title: String,
    artist: String,
    coverUrl: String,
    duration: f64,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let guard = state.handle.lock().map_err(|error| error.to_string())?;
        if let Some(handle) = guard.as_ref() {
            handle
                .run_mobile_plugin::<()>(
                    "updateMetadata",
                    NativeMetadataPayload {
                        title,
                        artist,
                        cover_url: coverUrl,
                        duration,
                    },
                )
                .map_err(|error| error.to_string())?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        state
            .mpris
            .update_metadata(title, artist, coverUrl, duration);
    }

    #[cfg(target_os = "windows")]
    {
        state
            .smtc
            .update_metadata(title, artist, coverUrl, duration);
    }

    #[cfg(not(any(target_os = "android", target_os = "linux", target_os = "windows")))]
    {
        let _ = (state, title, artist, coverUrl, duration);
    }

    Ok(())
}

/// 更新原生媒体播放状态（播放/暂停 + 进度）。
#[allow(non_snake_case)]
#[tauri::command]
pub fn updatePlaybackState(
    state: State<'_, NativeMediaState>,
    playing: bool,
    position: f64,
    duration: f64,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let guard = state.handle.lock().map_err(|error| error.to_string())?;
        if let Some(handle) = guard.as_ref() {
            handle
                .run_mobile_plugin::<()>(
                    "updatePlaybackState",
                    NativePlaybackPayload {
                        playing,
                        position,
                        duration,
                    },
                )
                .map_err(|error| error.to_string())?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        let _ = duration;
        state.mpris.update_playback_state(playing, position);
    }

    #[cfg(target_os = "windows")]
    {
        let _ = duration;
        state.smtc.update_playback_state(playing, position);
    }

    #[cfg(not(any(target_os = "android", target_os = "linux", target_os = "windows")))]
    {
        let _ = (state, playing, position, duration);
    }

    Ok(())
}

/// Android / Linux 轮询待处理的媒体按钮动作。
#[allow(non_snake_case)]
#[tauri::command]
pub fn pollPendingAction(state: State<'_, NativeMediaState>) -> Result<NativePendingAction, String> {
    #[cfg(target_os = "android")]
    {
        let guard = state.handle.lock().map_err(|error| error.to_string())?;
        if let Some(handle) = guard.as_ref() {
            return handle
                .run_mobile_plugin::<NativePendingAction>("pollPendingAction", json!({}))
                .map_err(|error| error.to_string());
        }
    }

    #[cfg(target_os = "linux")]
    {
        return Ok(NativePendingAction {
            action: state.mpris.poll_pending_action(),
        });
    }

    #[cfg(target_os = "windows")]
    {
        return Ok(NativePendingAction {
            action: state.smtc.poll_pending_action(),
        });
    }

    #[cfg(not(any(target_os = "android", target_os = "linux", target_os = "windows")))]
    {
        let _ = state;
    }

    Ok(NativePendingAction {
        action: String::new(),
    })
}

// ── helpers ────────────────────────────────────────────────

fn value_to_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        _ => value.to_string(),
    }
}

fn build_api_url(base: &str, endpoint: &str) -> Result<reqwest::Url, String> {
    let base = base.trim_end_matches('/');
    let endpoint = endpoint.trim_start_matches('/');
    let url = reqwest::Url::parse(&format!("{base}/{endpoint}"))
        .map_err(|error| format!("Invalid API url: {error}"))?;

    match url.scheme() {
        "http" | "https" => Ok(url),
        scheme => Err(format!("Unsupported API url scheme: {scheme}")),
    }
}

fn append_query_pairs(url: &mut reqwest::Url, params: &Value, cookie: Option<&str>) {
    if let Some(map) = params.as_object() {
        let mut pairs = url.query_pairs_mut();
        for (key, value) in map {
            if value.is_null() {
                continue;
            }
            pairs.append_pair(key, &value_to_string(value));
        }
        if let Some(cookie) = cookie.filter(|cookie| !cookie.is_empty()) {
            pairs.append_pair("cookie", cookie);
        }
    }
}

fn value_to_form_pairs(body: &Value, cookie: Option<&str>) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    if let Some(map) = body.as_object() {
        for (key, value) in map {
            if value.is_null() {
                continue;
            }
            pairs.push((key.clone(), value_to_string(value)));
        }
    }
    if let Some(cookie) = cookie.filter(|cookie| !cookie.is_empty()) {
        pairs.push(("cookie".to_string(), cookie.to_string()));
    }
    pairs
}

fn collect_set_cookie(headers: &HeaderMap) -> String {
    headers
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .filter_map(|value| value.split(';').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("; ")
}

#[cfg(target_os = "linux")]
mod linux_mpris;

use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, COOKIE, SET_COOKIE, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
#[cfg(target_os = "android")]
use std::sync::Mutex;
use tauri::State;

const API_TIMEOUT_SECS: u64 = 15;
const APP_USER_AGENT: &str = "zheting/0.1.0";
const NATIVE_MEDIA_PLUGIN_NAME: &str = "nativeMedia";

struct AppState {
    client: reqwest::Client,
}

struct NativeMediaState {
    #[cfg(target_os = "android")]
    handle: Mutex<Option<tauri::plugin::PluginHandle<tauri::Wry>>>,
    #[cfg(target_os = "linux")]
    mpris: linux_mpris::LinuxMprisState,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NcmRequest {
    base: String,
    endpoint: String,
    params: Value,
    method: String,
    body: Option<Value>,
    cookie: Option<String>,
    allow_error_body: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NcmResponse {
    data: Value,
    cookie: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeMetadataPayload {
    title: String,
    artist: String,
    cover_url: String,
    duration: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativePlaybackPayload {
    playing: bool,
    position: f64,
    duration: f64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativePendingAction {
    action: String,
}

fn append_query_pairs(url: &mut reqwest::Url, params: &Value, cookie: Option<&str>) {
    if let Some(map) = params.as_object() {
        let mut pairs = url.query_pairs_mut();
        for (key, value) in map {
            if value.is_null() {
                continue;
            }
            let text = match value {
                Value::String(text) => text.clone(),
                Value::Bool(value) => value.to_string(),
                Value::Number(value) => value.to_string(),
                _ => value.to_string(),
            };
            pairs.append_pair(key, &text);
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
            let text = match value {
                Value::String(text) => text.clone(),
                Value::Bool(value) => value.to_string(),
                Value::Number(value) => value.to_string(),
                _ => value.to_string(),
            };
            pairs.push((key.clone(), text));
        }
    }
    if let Some(cookie) = cookie.filter(|cookie| !cookie.is_empty()) {
        pairs.push(("cookie".to_string(), cookie.to_string()));
    }
    pairs
}

fn collect_set_cookie(headers: &HeaderMap) -> String {
    headers
        .get_all(SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .filter_map(|value| value.split(';').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("; ")
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

fn native_media_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new(NATIVE_MEDIA_PLUGIN_NAME)
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle = api
                    .register_android_plugin("com.zheting.music", "MediaSessionPlugin")?;
                app.manage(NativeMediaState {
                    handle: Mutex::new(Some(handle)),
                });
            }

            #[cfg(target_os = "linux")]
            {
                let _ = api;
                app.manage(NativeMediaState {
                    mpris: linux_mpris::LinuxMprisState::new(),
                });
            }

            #[cfg(not(any(target_os = "android", target_os = "linux")))]
            {
                let _ = api;
                app.manage(NativeMediaState {});
            }

            Ok(())
        })
        .build()
}

#[allow(non_snake_case)]
#[tauri::command]
fn updateMetadata(
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

    #[cfg(not(any(target_os = "android", target_os = "linux")))]
    {
        let _ = (state, title, artist, coverUrl, duration);
    }

    Ok(())
}

#[allow(non_snake_case)]
#[tauri::command]
fn updatePlaybackState(
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

    #[cfg(not(any(target_os = "android", target_os = "linux")))]
    {
        let _ = (state, playing, position, duration);
    }

    Ok(())
}

#[allow(non_snake_case)]
#[tauri::command]
fn pollPendingAction(state: State<'_, NativeMediaState>) -> Result<NativePendingAction, String> {
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

    #[cfg(not(any(target_os = "android", target_os = "linux")))]
    {
        let _ = state;
    }

    Ok(NativePendingAction {
        action: String::new(),
    })
}

#[tauri::command]
async fn ncm_request(
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(API_TIMEOUT_SECS))
        .build()
        .expect("failed to create HTTP client");

    tauri::Builder::default()
        .manage(AppState { client })
        .plugin(native_media_plugin())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ncm_request,
            updateMetadata,
            updatePlaybackState,
            pollPendingAction
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

mod api;
#[cfg(target_os = "linux")]
mod linux_mpris;
mod media_metadata;
mod media_playback;
mod pending_action;
mod webdav;
#[cfg(target_os = "windows")]
mod windows_smtc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Manager;

pub(crate) const API_TIMEOUT_SECS: u64 = 15;
// 版本号从 Cargo.toml 取，别再手写：这里曾是第 5 处版本号，早就漂到 0.1.0 了，
// 而 check:versions 只守 package.json / tauri.conf.json / Cargo.toml / Cargo.lock 四处。
pub(crate) const APP_USER_AGENT: &str = concat!(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) zheting/",
    env!("CARGO_PKG_VERSION"),
    " Chrome/120.0.0.0 Safari/537.36"
);
const NATIVE_MEDIA_PLUGIN_NAME: &str = "nativeMedia";

pub(crate) struct AppState {
    pub(crate) client: reqwest::Client,
}

pub(crate) struct NativeMediaState {
    #[cfg(target_os = "linux")]
    pub(crate) mpris: linux_mpris::LinuxMprisState,
    #[cfg(target_os = "windows")]
    pub(crate) smtc: windows_smtc::WindowsSmtcState,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApiRequest {
    pub(crate) provider: Option<String>,
    pub(crate) base: String,
    pub(crate) endpoint: String,
    pub(crate) params: Value,
    pub(crate) method: String,
    pub(crate) body: Option<Value>,
    pub(crate) cookie: Option<String>,
    pub(crate) allow_error_body: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApiResponse {
    pub(crate) data: Value,
    pub(crate) cookie: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativePendingAction {
    pub(crate) action: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientErrorLog {
    level: String,
    message: String,
    stack: Option<String>,
    source: Option<String>,
}

#[tauri::command]
fn dev_report_client_error(log: ClientErrorLog) {
    if cfg!(any(debug_assertions, feature = "dev-channel")) {
        log::error!(
            "[client:{}] {}{}{}",
            log.level,
            log.message,
            log.source
                .map(|source| format!("\nsource: {source}"))
                .unwrap_or_default(),
            log.stack
                .map(|stack| format!("\n{stack}"))
                .unwrap_or_default()
        );
    }
}

#[tauri::command]
fn dev_open_devtools(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(any(debug_assertions, feature = "dev-channel"))]
    {
        window.open_devtools();
        Ok(())
    }
    #[cfg(not(any(debug_assertions, feature = "dev-channel")))]
    {
        let _ = window;
        Err("Developer tools are disabled in stable builds".into())
    }
}

fn native_media_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new(NATIVE_MEDIA_PLUGIN_NAME)
        .setup(|app, api| {
            #[cfg(target_os = "linux")]
            {
                let _ = api;
                app.manage(NativeMediaState {
                    mpris: linux_mpris::LinuxMprisState::new(),
                });
            }

            #[cfg(target_os = "windows")]
            {
                let _ = (app, api);
            }

            #[cfg(not(any(target_os = "linux", target_os = "windows")))]
            {
                let _ = api;
                app.manage(NativeMediaState {});
            }

            Ok(())
        })
        .build()
}

pub fn run() {
    #[cfg(target_os = "windows")]
    if let Err(error) = windows_smtc::set_process_app_id() {
        eprintln!("failed to set Windows AppUserModelID: {error}");
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(API_TIMEOUT_SECS))
        // 禁用自动重定向：防止白名单 host 302 到内网/攻击者地址绕过 SSRF 校验
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("failed to create HTTP client");

    tauri::Builder::default()
        .manage(AppState { client })
        .plugin(native_media_plugin())
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                let window = app.get_webview_window("main").ok_or_else(|| {
                    std::io::Error::new(std::io::ErrorKind::NotFound, "main window not found")
                })?;
                let hwnd = window.hwnd()?.0 as isize;
                app.manage(NativeMediaState {
                    smtc: windows_smtc::WindowsSmtcState::new(hwnd),
                });
            }

            #[cfg(desktop)]
            {
                // 单实例：桌面端再次启动时聚焦已有窗口，避免多开
                app.handle()
                    .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }))?;
                // 窗口状态：记住桌面端窗口大小与位置
                app.handle()
                    .plugin(tauri_plugin_window_state::Builder::default().build())?;
            }
            if cfg!(any(debug_assertions, feature = "dev-channel")) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            api::api_request,
            media_metadata::updateMetadata,
            media_playback::updatePlaybackState,
            pending_action::pollPendingAction,
            webdav::webdav_list_audio,
            webdav::webdav_cache_audio,
            dev_report_client_error,
            dev_open_devtools
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

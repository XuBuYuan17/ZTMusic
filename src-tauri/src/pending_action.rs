use tauri::State;

use crate::{NativeMediaState, NativePendingAction};

/// Android / Linux / Windows 轮询待处理的媒体按钮动作。
#[allow(non_snake_case, unreachable_code)]
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
    { return Ok(NativePendingAction { action: state.mpris.poll_pending_action() }); }

    #[cfg(target_os = "windows")]
    { return Ok(NativePendingAction { action: state.smtc.poll_pending_action() }); }

    #[cfg(not(any(target_os = "android", target_os = "linux", target_os = "windows")))]
    { let _ = state; }

    Ok(NativePendingAction { action: String::new() })
}

use tauri::State;

use crate::NativeMediaState;
#[cfg(target_os = "android")]
use crate::NativePlaybackPayload;

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
        state.smtc.update_playback_state(playing, position, duration);
    }

    #[cfg(not(any(target_os = "android", target_os = "linux", target_os = "windows")))]
    {
        let _ = (state, playing, position, duration);
    }

    Ok(())
}

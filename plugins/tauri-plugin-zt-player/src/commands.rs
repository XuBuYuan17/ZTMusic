use tauri::{AppHandle, command, Runtime};

use crate::models::*;
use crate::Result;
use crate::ZtPlayerExt;

#[command]
pub(crate) async fn register_listener<R: Runtime>(app: AppHandle<R>, event: String, handler: serde_json::Value) -> Result<serde_json::Value> {
    app.zt_player().forward("registerListener", serde_json::json!({ "event": event, "handler": handler }))
}

#[command]
pub(crate) async fn remove_listener<R: Runtime>(app: AppHandle<R>, event: String, channel_id: u64) -> Result<serde_json::Value> {
    app.zt_player().forward("removeListener", serde_json::json!({ "event": event, "channelId": channel_id }))
}

#[command]
pub(crate) async fn execute<R: Runtime>(
    app: AppHandle<R>,
    payload: serde_json::Value,
) -> Result<serde_json::Value> {
    app.zt_player().execute(payload)
}

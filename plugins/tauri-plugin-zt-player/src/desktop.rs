use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<ZtPlayer<R>> {
  Ok(ZtPlayer(app.clone()))
}

/// Access to the zt-player APIs.
pub struct ZtPlayer<R: Runtime>(AppHandle<R>);

impl<R: Runtime> ZtPlayer<R> {
  pub fn forward(&self, _command: &str, _payload: serde_json::Value) -> crate::Result<serde_json::Value> {
    Err(std::io::Error::new(std::io::ErrorKind::Unsupported, "Android playback only").into())
  }
  pub fn execute(&self, _payload: serde_json::Value) -> crate::Result<serde_json::Value> {
    Err(std::io::Error::new(std::io::ErrorKind::Unsupported, "Android playback only").into())
  }
  pub fn ping(&self, payload: PingRequest) -> crate::Result<PingResponse> {
    Ok(PingResponse {
      value: payload.value,
    })
  }
}

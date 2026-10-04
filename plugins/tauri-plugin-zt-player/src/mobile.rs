use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_zt_player);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<ZtPlayer<R>> {
  #[cfg(target_os = "android")]
  let handle = api.register_android_plugin("com.zheting.player", "ZtPlayerPlugin")?;
  #[cfg(target_os = "ios")]
  let handle = api.register_ios_plugin(init_plugin_zt_player)?;
  Ok(ZtPlayer(handle))
}

/// Access to the zt-player APIs.
pub struct ZtPlayer<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> ZtPlayer<R> {
  pub fn forward(&self, command: &str, payload: serde_json::Value) -> crate::Result<serde_json::Value> {
    self.0.run_mobile_plugin(command, payload).map_err(Into::into)
  }
  pub fn execute(&self, payload: serde_json::Value) -> crate::Result<serde_json::Value> {
    self.0.run_mobile_plugin("execute", payload).map_err(Into::into)
  }
  pub fn ping(&self, payload: PingRequest) -> crate::Result<PingResponse> {
    self
      .0
      .run_mobile_plugin("ping", payload)
      .map_err(Into::into)
  }
}

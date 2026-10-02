use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::ZtPlayer;
#[cfg(mobile)]
use mobile::ZtPlayer;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the zt-player APIs.
pub trait ZtPlayerExt<R: Runtime> {
  fn zt_player(&self) -> &ZtPlayer<R>;
}

impl<R: Runtime, T: Manager<R>> crate::ZtPlayerExt<R> for T {
  fn zt_player(&self) -> &ZtPlayer<R> {
    self.state::<ZtPlayer<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("zt-player")
    .invoke_handler(tauri::generate_handler![commands::execute, commands::register_listener, commands::remove_listener])
    .setup(|app, api| {
      #[cfg(mobile)]
      let zt_player = mobile::init(app, api)?;
      #[cfg(desktop)]
      let zt_player = desktop::init(app, api)?;
      app.manage(zt_player);
      Ok(())
    })
    .build()
}

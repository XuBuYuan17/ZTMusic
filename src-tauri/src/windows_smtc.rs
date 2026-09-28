use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use async_channel::{bounded, Receiver, Sender};
use windows::core::{w, HSTRING};
use windows::Foundation::{TimeSpan, TypedEventHandler, Uri};
use windows::Media::{
    MediaPlaybackStatus, SystemMediaTransportControls, SystemMediaTransportControlsButton,
    SystemMediaTransportControlsButtonPressedEventArgs, SystemMediaTransportControlsDisplayUpdater,
    SystemMediaTransportControlsTimelineProperties,
};
use windows::Storage::Streams::RandomAccessStreamReference;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::WinRT::{
    ISystemMediaTransportControlsInterop, RoGetActivationFactory, RoInitialize, RoUninitialize,
    RO_INIT_MULTITHREADED,
};
use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

const APP_USER_MODEL_ID: &str = "com.zheting.music";
/// 消息通道容量：这些是「最新状态覆盖旧的」的更新，消费端一次只取一条，
/// 留几格缓冲足够吸收突发，塞满就丢（发送端用的是 try_send）。
const SMTC_CHANNEL_CAPACITY: usize = 8;

struct WindowsRuntimeApartment;

impl Drop for WindowsRuntimeApartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

pub fn set_process_app_id() -> windows::core::Result<()> {
    unsafe { SetCurrentProcessExplicitAppUserModelID(w!("com.zheting.music")) }
}

#[derive(Debug)]
#[allow(dead_code)]
enum WindowsSmtcMessage {
    Metadata {
        title: String,
        artist: String,
        cover_url: String,
        duration: f64,
    },
    Playback {
        playing: bool,
        position: f64,
        duration: f64,
    },
}

pub struct WindowsSmtcState {
    sender: Sender<WindowsSmtcMessage>,
    pending_action: Arc<Mutex<Option<String>>>,
    warned_closed: AtomicBool,
}

impl WindowsSmtcState {
    pub fn new(hwnd: isize) -> Self {
        // 有界通道：这些消息都是「最新状态覆盖旧的」，塞满时 try_send 直接失败即可。
        // 用 unbounded 的话，线程一旦退出（RoInitialize 失败、重连间隙）发送端还活着，
        // 队列只进不出，每播一首歌就多积一条。
        let (sender, receiver) = bounded(SMTC_CHANNEL_CAPACITY);
        let pending_action = Arc::new(Mutex::new(None));
        let thread_pending_action = Arc::clone(&pending_action);

        thread::spawn(move || {
            if let Err(error) = unsafe { RoInitialize(RO_INIT_MULTITHREADED) } {
                log::error!("Windows SMTC RoInitialize failed: {error}, aborting SMTC thread");
                return;
            }
            let _runtime_apartment = WindowsRuntimeApartment;
            loop {
                if let Err(error) = run_smtc(hwnd, &receiver, &thread_pending_action) {
                    log::warn!("Windows SMTC disconnected: {error}, reconnecting in 5s...");
                    std::thread::sleep(std::time::Duration::from_secs(5));
                } else {
                    // run_smtc 正常返回 = receiver 关闭（应用退出），结束线程
                    log::debug!("Windows SMTC channel closed, exiting SMTC thread");
                    return;
                }
            }
        });

        Self {
            sender,
            pending_action,
            warned_closed: AtomicBool::new(false),
        }
    }

    /// 通道塞满或线程已退出时记一次日志就够：线程死掉后每次同步都会失败，逐次记会刷屏。
    fn note_send(&self, delivered: bool, what: &str) {
        if delivered {
            self.warned_closed.store(false, Ordering::Relaxed);
            return;
        }
        if !self.warned_closed.swap(true, Ordering::Relaxed) {
            log::warn!("SMTC {what}: channel full or thread gone, updates dropped");
        }
    }

    pub fn update_metadata(&self, title: String, artist: String, cover_url: String, duration: f64) {
        let delivered = self
            .sender
            .try_send(WindowsSmtcMessage::Metadata {
                title,
                artist,
                cover_url,
                duration,
            })
            .is_ok();
        self.note_send(delivered, "metadata");
    }

    pub fn update_playback_state(&self, playing: bool, position: f64, duration: f64) {
        let delivered = self
            .sender
            .try_send(WindowsSmtcMessage::Playback {
                playing,
                position,
                duration,
            })
            .is_ok();
        self.note_send(delivered, "playback");
    }

    pub fn poll_pending_action(&self) -> String {
        self.pending_action
            .lock()
            .ok()
            .and_then(|mut action| action.take())
            .unwrap_or_default()
    }
}

fn run_smtc(
    hwnd: isize,
    receiver: &Receiver<WindowsSmtcMessage>,
    pending_action: &Arc<Mutex<Option<String>>>,
) -> windows::core::Result<()> {
    // 首次有歌曲或播放状态时才创建会话，避免应用启动后出现空白媒体卡片。
    let first_message = match receiver.recv_blocking() {
        Ok(message) => message,
        Err(_) => return Ok(()),
    };

    let activation_factory: ISystemMediaTransportControlsInterop = unsafe {
        RoGetActivationFactory(&HSTRING::from("Windows.Media.SystemMediaTransportControls"))?
    };
    let smtc: SystemMediaTransportControls =
        unsafe { activation_factory.GetForWindow(HWND(hwnd as *mut std::ffi::c_void))? };

    smtc.SetIsEnabled(true)?;
    smtc.SetIsPlayEnabled(true)?;
    smtc.SetIsPauseEnabled(true)?;
    smtc.SetIsNextEnabled(true)?;
    smtc.SetIsPreviousEnabled(true)?;

    // Register button handler
    let button_handler = Arc::clone(pending_action);
    smtc.ButtonPressed(&TypedEventHandler::new(
        move |_, args: &Option<SystemMediaTransportControlsButtonPressedEventArgs>| {
            if let Some(args) = args {
                let button = args.Button()?;
                let action = match button {
                    SystemMediaTransportControlsButton::Play => "play",
                    SystemMediaTransportControlsButton::Pause => "pause",
                    SystemMediaTransportControlsButton::Next => "next",
                    SystemMediaTransportControlsButton::Previous => "prev",
                    SystemMediaTransportControlsButton::Stop => "pause",
                    _ => "",
                };
                if !action.is_empty() {
                    set_pending_action(&button_handler, action);
                }
            }
            Ok(())
        },
    ))?;

    let display_updater = smtc.DisplayUpdater()?;
    display_updater.SetAppMediaId(&HSTRING::from(APP_USER_MODEL_ID))?;

    handle_message(&smtc, &display_updater, first_message)?;
    while let Ok(message) = receiver.recv_blocking() {
        handle_message(&smtc, &display_updater, message)?;
    }

    smtc.SetIsEnabled(false)?;
    Ok(())
}

fn handle_message(
    smtc: &SystemMediaTransportControls,
    display_updater: &SystemMediaTransportControlsDisplayUpdater,
    message: WindowsSmtcMessage,
) -> windows::core::Result<()> {
    match message {
        WindowsSmtcMessage::Metadata {
            title,
            artist,
            cover_url,
            duration: _,
        } => {
            display_updater.SetType(windows::Media::MediaPlaybackType::Music)?;
            let properties = display_updater.MusicProperties()?;
            properties.SetTitle(&HSTRING::from(&title))?;
            properties.SetArtist(&HSTRING::from(&artist))?;

            if !cover_url.is_empty() {
                match Uri::CreateUri(&HSTRING::from(&cover_url))
                    .and_then(|uri| RandomAccessStreamReference::CreateFromUri(&uri))
                {
                    Ok(thumbnail) => display_updater.SetThumbnail(&thumbnail)?,
                    Err(error) => log::warn!("SMTC cover URL rejected: {error}"),
                }
            }

            display_updater.Update()?;
            log::debug!("SMTC metadata update: {title} - {artist}");
        }
        WindowsSmtcMessage::Playback {
            playing,
            position,
            duration,
        } => {
            let status = if playing {
                MediaPlaybackStatus::Playing
            } else {
                MediaPlaybackStatus::Paused
            };
            smtc.SetPlaybackStatus(status)?;

            let timeline = SystemMediaTransportControlsTimelineProperties::new()?;
            timeline.SetEndTime(TimeSpan {
                Duration: (duration * 10_000_000.0) as i64,
            })?;
            timeline.SetPosition(TimeSpan {
                Duration: (position * 10_000_000.0) as i64,
            })?;
            smtc.UpdateTimelineProperties(&timeline)?;

            log::debug!(
                "SMTC playback update: playing={playing}, position={position}, duration={duration}"
            );
        }
    }
    Ok(())
}

fn set_pending_action(action: &Arc<Mutex<Option<String>>>, value: &str) {
    if let Ok(mut guard) = action.lock() {
        *guard = Some(value.to_string());
    }
}

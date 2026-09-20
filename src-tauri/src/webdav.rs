use std::{
    collections::hash_map::DefaultHasher,
    fs::{self, OpenOptions},
    hash::{Hash, Hasher},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use reqwest::{
    header::{CONTENT_LENGTH, CONTENT_TYPE, USER_AGENT},
    Method, Url,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{AppState, APP_USER_AGENT};

const PROPFIND_BODY: &str = r#"<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:getcontentlength/>
    <D:getlastmodified/>
    <D:getcontenttype/>
    <D:resourcetype/>
  </D:prop>
</D:propfind>"#;

const AUDIO_EXTENSIONS: &[&str] = &["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav"];
const MAX_TRACKS: usize = 500;
const MAX_AUDIO_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_CACHE_BYTES: u64 = 3 * 1024 * 1024 * 1024;
// 音频下载的按请求总超时：共享 client 的 15s 是给 API 信号的，大文件必须放宽（覆盖 body 读取全程）
const WEBDAV_DOWNLOAD_TIMEOUT_SECS: u64 = 600;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavRequest {
    pub url: String,
    pub base_url: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavTrack {
    pub id: String,
    pub name: String,
    pub url: String,
    pub file_size: u64,
    pub mime: String,
    pub last_modified: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavCachedAudio {
    pub path: String,
    pub mime: String,
}

#[tauri::command]
pub async fn webdav_list_audio(
    state: State<'_, AppState>,
    request: WebDavRequest,
) -> Result<Vec<WebDavTrack>, String> {
    let base_url = validate_webdav_url(&request.url)?;
    let method = Method::from_bytes(b"PROPFIND").map_err(|error| error.to_string())?;
    let mut builder = state
        .client
        .request(method, base_url.clone())
        .header(USER_AGENT, APP_USER_AGENT)
        .header("Depth", "1")
        .header(CONTENT_TYPE, "application/xml; charset=utf-8")
        .body(PROPFIND_BODY);

    if let Some(username) = request
        .username
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        builder = builder.basic_auth(username, request.password.clone());
    }

    let response = builder
        .send()
        .await
        .map_err(|error| format!("WebDAV request failed: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("WebDAV scan failed: {status}"));
    }
    let xml = response
        .text()
        .await
        .map_err(|error| format!("WebDAV response read failed: {error}"))?;

    Ok(parse_webdav_tracks(&xml, &base_url))
}

#[tauri::command]
pub async fn webdav_cache_audio(
    app: AppHandle,
    state: State<'_, AppState>,
    request: WebDavRequest,
) -> Result<WebDavCachedAudio, String> {
    let base_url = request
        .base_url
        .as_deref()
        .ok_or_else(|| "WebDAV base URL is required; please rescan the library".to_string())?;
    let url = validate_download_url(&request.url, base_url)?;
    let base_origin = validate_webdav_url(base_url)?.origin();
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Cannot resolve app cache directory: {error}"))?
        .join("webdav-audio");
    fs::create_dir_all(&cache_dir)
        .map_err(|error| format!("Cannot create WebDAV cache: {error}"))?;

    let extension = extension_from_url(&url);
    let path = cache_dir.join(cache_file_name(url.as_str(), extension));
    if path
        .metadata()
        .is_ok_and(|metadata| metadata.is_file() && metadata.len() > 0)
    {
        touch_cache_file(&path);
        let _ = prune_cache(&cache_dir, MAX_CACHE_BYTES, Some(&path));
        return Ok(WebDavCachedAudio {
            path: path.to_string_lossy().to_string(),
            mime: mime_from_extension(extension).to_string(),
        });
    }
    if path.exists() {
        let _ = fs::remove_file(&path);
    }

    let mut builder = state
        .client
        .get(url.clone())
        .timeout(std::time::Duration::from_secs(WEBDAV_DOWNLOAD_TIMEOUT_SECS))
        .header(USER_AGENT, APP_USER_AGENT);

    if let Some(username) = request
        .username
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        builder = builder.basic_auth(username, request.password.clone());
    }

    let mut response = builder
        .send()
        .await
        .map_err(|error| format!("WebDAV audio request failed: {error}"))?;
    if response.url().origin() != base_origin {
        return Err("WebDAV audio redirect changed the configured origin".to_string());
    }
    let status = response.status();
    if !status.is_success() {
        return Err(format!("WebDAV audio request failed: {status}"));
    }

    let content_length = response
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    if content_length > MAX_AUDIO_BYTES {
        return Err("WebDAV audio is larger than 1 GB".to_string());
    }

    let mime = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("audio/mpeg")
        .split(';')
        .next()
        .unwrap_or("audio/mpeg")
        .to_string();
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temp_path = cache_dir.join(format!(
        "{}.{}.part",
        cache_file_name(url.as_str(), extension),
        nonce
    ));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp_path)
        .map_err(|error| format!("Cannot create WebDAV cache file: {error}"))?;

    let emit_progress = |downloaded: u64| {
        let _ = app.emit(
            "webdav-audio-progress",
            serde_json::json!({
                "key": cache_file_name(url.as_str(), extension),
                "downloaded": downloaded,
                "total": content_length,
            }),
        );
    };

    let download_result: Result<(), String> = async {
        let mut downloaded = 0_u64;
        let mut last_emitted = 0_u64;
        let mut last_emit_at = SystemTime::now();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("WebDAV audio download failed: {error}"))?
        {
            downloaded = downloaded
                .checked_add(chunk.len() as u64)
                .ok_or_else(|| "WebDAV audio is too large".to_string())?;
            if downloaded > MAX_AUDIO_BYTES {
                return Err("WebDAV audio is larger than 1 GB".to_string());
            }
            file.write_all(&chunk)
                .map_err(|error| format!("Cannot write WebDAV cache: {error}"))?;
            // 按 250ms 或 1MB 节流，避免小文件下载时刷爆事件通道
            let now = SystemTime::now();
            let elapsed_ms = now
                .duration_since(last_emit_at)
                .unwrap_or_default()
                .as_millis();
            if downloaded - last_emitted >= 1024 * 1024 || elapsed_ms >= 250 {
                emit_progress(downloaded);
                last_emitted = downloaded;
                last_emit_at = now;
            }
        }
        if downloaded == 0 {
            return Err("WebDAV audio response is empty".to_string());
        }
        emit_progress(downloaded);
        file.sync_all()
            .map_err(|error| format!("Cannot flush WebDAV cache: {error}"))?;
        Ok(())
    }
    .await;
    drop(file);
    if let Err(error) = download_result {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }
    if let Err(error) = fs::rename(&temp_path, &path) {
        if path.metadata().is_ok_and(|metadata| metadata.len() > 0) {
            let _ = fs::remove_file(&temp_path);
        } else {
            let _ = fs::remove_file(&temp_path);
            return Err(format!("Cannot finalize WebDAV cache: {error}"));
        }
    }
    touch_cache_file(&path);
    let _ = prune_cache(&cache_dir, MAX_CACHE_BYTES, Some(&path));

    Ok(WebDavCachedAudio {
        path: path.to_string_lossy().to_string(),
        mime,
    })
}

fn validate_download_url(remote: &str, base: &str) -> Result<Url, String> {
    let remote_url = validate_webdav_url(remote)?;
    let base_url = validate_webdav_url(base)?;
    if remote_url.origin() != base_url.origin() {
        return Err("WebDAV audio origin does not match the configured server".to_string());
    }
    Ok(remote_url)
}

fn touch_cache_file(path: &Path) {
    if let Ok(file) = OpenOptions::new().write(true).open(path) {
        let _ = file.set_modified(SystemTime::now());
    }
}

fn prune_cache(cache_dir: &Path, max_bytes: u64, protected: Option<&Path>) -> Result<(), String> {
    let mut entries: Vec<(PathBuf, u64, SystemTime)> = fs::read_dir(cache_dir)
        .map_err(|error| format!("Cannot read WebDAV cache: {error}"))?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) == Some("part") {
                return None;
            }
            let metadata = entry.metadata().ok()?;
            metadata.is_file().then(|| {
                let modified = metadata.modified().unwrap_or(UNIX_EPOCH);
                (path, metadata.len(), modified)
            })
        })
        .collect();
    let mut total = entries.iter().map(|(_, size, _)| size).sum::<u64>();
    entries.sort_by_key(|(_, _, modified)| *modified);
    for (path, size, _) in entries {
        if total <= max_bytes {
            break;
        }
        if protected.is_some_and(|value| value == path.as_path()) {
            continue;
        }
        if fs::remove_file(&path).is_ok() {
            total = total.saturating_sub(size);
        }
    }
    Ok(())
}

fn validate_webdav_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw.trim()).map_err(|error| format!("Invalid WebDAV url: {error}"))?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        scheme => Err(format!("Unsupported WebDAV scheme: {scheme}")),
    }
}

fn parse_webdav_tracks(xml: &str, base_url: &Url) -> Vec<WebDavTrack> {
    split_response_blocks(xml)
        .into_iter()
        .filter_map(|block| track_from_block(block, base_url))
        .take(MAX_TRACKS)
        .collect()
}

fn split_response_blocks(xml: &str) -> Vec<&str> {
    let lower = xml.to_ascii_lowercase();
    let mut blocks = Vec::new();
    let mut start = 0;
    while let Some(relative) = lower[start..].find("<") {
        let open = start + relative;
        let tail = &lower[open..];
        if !tail.starts_with("<d:response")
            && !tail.starts_with("<response")
            && !tail.starts_with("<dav:response")
        {
            start = open + 1;
            continue;
        }
        let close = tail
            .find("</d:response>")
            .or_else(|| tail.find("</response>"))
            .or_else(|| tail.find("</dav:response>"));
        if let Some(close) = close {
            let end = open + close + tail[close..].find('>').unwrap_or(0) + 1;
            blocks.push(&xml[open..end]);
            start = end;
        } else {
            break;
        }
    }
    blocks
}

fn track_from_block(block: &str, base_url: &Url) -> Option<WebDavTrack> {
    let href = tag_value(block, "href")?;
    let url = base_url.join(&decode_xml(&href)).ok()?;
    // href 可以是绝对 URL，此时 Url::join 会整体替换 base。必须把 origin 钉死：
    // 否则被攻陷的 server 只需回一个 <href>http://内网地址/x.mp3</href>，
    // 该地址就会被持久化成曲目，之后 webdav_cache_audio 会带着用户的 Basic 凭据去抓它。
    if url.origin() != base_url.origin() {
        return None;
    }
    if url.as_str().trim_end_matches('/') == base_url.as_str().trim_end_matches('/') {
        return None;
    }
    if url.path().ends_with('/') || !is_audio_url(&url) {
        return None;
    }

    let display = tag_value(block, "displayname")
        .map(|value| decode_xml(&value))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| file_name_from_url(&url));
    let size = tag_value(block, "getcontentlength")
        .and_then(|value| value.trim().parse::<u64>().ok())
        .unwrap_or(0);
    let mime = tag_value(block, "getcontenttype").unwrap_or_default();
    let last_modified = tag_value(block, "getlastmodified").unwrap_or_default();

    Some(WebDavTrack {
        id: format!("webdav:{:016x}", hash_text(url.as_str())),
        name: display,
        url: url.to_string(),
        file_size: size,
        mime,
        last_modified,
    })
}

fn tag_value(block: &str, local_name: &str) -> Option<String> {
    let lower = block.to_ascii_lowercase();
    let needle = format!(":{local_name}>");
    let fallback = format!("<{local_name}>");
    let start = lower
        .find(&needle)
        .map(|pos| pos + needle.len())
        .or_else(|| lower.find(&fallback).map(|pos| pos + fallback.len()))?;
    let end_tag = format!("</");
    let end = lower[start..].find(&end_tag).map(|pos| start + pos)?;
    Some(block[start..end].trim().to_string())
}

fn is_audio_url(url: &Url) -> bool {
    AUDIO_EXTENSIONS.iter().any(|ext| {
        url.path()
            .to_ascii_lowercase()
            .ends_with(&format!(".{ext}"))
    })
}

fn file_name_from_url(url: &Url) -> String {
    url.path_segments()
        .and_then(|segments| segments.last())
        .map(percent_decode)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "WebDAV 音乐".to_string())
}

fn extension_from_url(url: &Url) -> &str {
    AUDIO_EXTENSIONS
        .iter()
        .copied()
        .find(|ext| {
            url.path()
                .to_ascii_lowercase()
                .ends_with(&format!(".{ext}"))
        })
        .unwrap_or("mp3")
}

fn mime_from_extension(extension: &str) -> &str {
    match extension {
        "aac" => "audio/aac",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "oga" | "ogg" | "opus" => "audio/ogg",
        "wav" => "audio/wav",
        _ => "audio/mpeg",
    }
}

fn cache_file_name(input: &str, ext: &str) -> String {
    format!("{:016x}.{ext}", hash_text(input))
}

fn hash_text(input: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    hasher.finish()
}

fn decode_xml(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(hex) = std::str::from_utf8(&bytes[index + 1..index + 3]) {
                if let Ok(value) = u8::from_str_radix(hex, 16) {
                    out.push(value);
                    index += 3;
                    continue;
                }
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_audio_files_from_namespaced_propfind() {
        let base = Url::parse("https://dav.example.com/music/").unwrap();
        let xml = r#"
          <D:multistatus xmlns:D="DAV:">
            <D:response><D:href>/music/</D:href></D:response>
            <D:response>
              <D:href>/music/%E6%B5%8B%E8%AF%95.mp3</D:href>
              <D:propstat><D:prop>
                <D:displayname>测试.mp3</D:displayname>
                <D:getcontentlength>42</D:getcontentlength>
                <D:getcontenttype>audio/mpeg</D:getcontenttype>
              </D:prop></D:propstat>
            </D:response>
            <D:response><D:href>/music/readme.txt</D:href></D:response>
          </D:multistatus>
        "#;

        let tracks = parse_webdav_tracks(xml, &base);
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].name, "测试.mp3");
        assert_eq!(tracks[0].file_size, 42);
        assert_eq!(tracks[0].mime, "audio/mpeg");
    }

    #[test]
    fn decodes_percent_file_names() {
        let url = Url::parse("https://dav.example.com/music/%E5%A4%9C%E6%9B%B2.flac").unwrap();
        assert_eq!(file_name_from_url(&url), "夜曲.flac");
    }

    #[test]
    fn rejects_hrefs_pointing_outside_the_base_origin() {
        let base = Url::parse("https://dav.example.com/music/").unwrap();
        let xml = r#"
          <D:multistatus xmlns:D="DAV:">
            <D:response><D:href>http://169.254.169.254/latest/meta-data.mp3</D:href></D:response>
            <D:response><D:href>http://127.0.0.1:8080/secret.mp3</D:href></D:response>
            <D:response><D:href>https://dav.example.com:8443/music/other.mp3</D:href></D:response>
            <D:response><D:href>http://dav.example.com/music/downgraded.mp3</D:href></D:response>
            <D:response><D:href>/music/legit.mp3</D:href></D:response>
          </D:multistatus>
        "#;

        let tracks = parse_webdav_tracks(xml, &base);
        assert_eq!(tracks.len(), 1, "只有同 origin 的 href 能通过");
        assert_eq!(tracks[0].url, "https://dav.example.com/music/legit.mp3");
    }

    #[test]
    fn validates_origin_again_before_download() {
        assert!(validate_download_url(
            "https://dav.example.com/music/song.flac",
            "https://dav.example.com/music/"
        )
        .is_ok());
        assert!(validate_download_url(
            "http://127.0.0.1/private/song.flac",
            "https://dav.example.com/music/"
        )
        .is_err());
    }

    #[test]
    fn prunes_oldest_cache_files_first() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("zheting-webdav-cache-{nonce}"));
        fs::create_dir_all(&dir).unwrap();
        let old = dir.join("old.flac");
        let recent = dir.join("recent.flac");
        fs::write(&old, [0_u8; 3]).unwrap();
        fs::write(&recent, [0_u8; 3]).unwrap();
        OpenOptions::new()
            .write(true)
            .open(&old)
            .unwrap()
            .set_modified(UNIX_EPOCH + std::time::Duration::from_secs(1))
            .unwrap();
        OpenOptions::new()
            .write(true)
            .open(&recent)
            .unwrap()
            .set_modified(UNIX_EPOCH + std::time::Duration::from_secs(2))
            .unwrap();

        prune_cache(&dir, 3, Some(&recent)).unwrap();

        assert!(!old.exists());
        assert!(recent.exists());
        fs::remove_dir_all(dir).unwrap();
    }
}

use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
};

use reqwest::{
    header::{CONTENT_LENGTH, CONTENT_TYPE, USER_AGENT},
    Method, Url,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavRequest {
    pub url: String,
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
    let url = validate_webdav_url(&request.url)?;
    let mut builder = state
        .client
        .get(url.clone())
        .header(USER_AGENT, APP_USER_AGENT);

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
        .map_err(|error| format!("WebDAV audio request failed: {error}"))?;
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
    if content_length > 1024 * 1024 * 1024 {
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
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("WebDAV audio download failed: {error}"))?;

    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Cannot resolve app cache directory: {error}"))?
        .join("webdav-audio");
    fs::create_dir_all(&cache_dir)
        .map_err(|error| format!("Cannot create WebDAV cache: {error}"))?;

    let file_name = cache_file_name(url.as_str(), extension_from_url(&url));
    let path = cache_dir.join(file_name);
    fs::write(&path, &bytes).map_err(|error| format!("Cannot write WebDAV cache: {error}"))?;

    Ok(WebDavCachedAudio {
        path: path.to_string_lossy().to_string(),
        mime,
    })
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
}

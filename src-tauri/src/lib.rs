use reqwest::header::{HeaderMap, HeaderValue, COOKIE, CONTENT_TYPE, SET_COOKIE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NcmRequest {
  base: String,
  endpoint: String,
  params: Value,
  method: String,
  body: Option<Value>,
  cookie: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NcmResponse {
  data: Value,
  cookie: String,
}

fn append_query_pairs(url: &mut reqwest::Url, params: &Value, cookie: Option<&str>) {
  if let Some(map) = params.as_object() {
    let mut pairs = url.query_pairs_mut();
    for (key, value) in map {
      if value.is_null() {
        continue;
      }
      let text = match value {
        Value::String(text) => text.clone(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        _ => value.to_string(),
      };
      pairs.append_pair(key, &text);
    }
    if let Some(cookie) = cookie.filter(|cookie| !cookie.is_empty()) {
      pairs.append_pair("cookie", cookie);
    }
  }
}

fn value_to_form_pairs(body: &Value, cookie: Option<&str>) -> Vec<(String, String)> {
  let mut pairs = Vec::new();
  if let Some(map) = body.as_object() {
    for (key, value) in map {
      if value.is_null() {
        continue;
      }
      let text = match value {
        Value::String(text) => text.clone(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        _ => value.to_string(),
      };
      pairs.push((key.clone(), text));
    }
  }
  if let Some(cookie) = cookie.filter(|cookie| !cookie.is_empty()) {
    pairs.push(("cookie".to_string(), cookie.to_string()));
  }
  pairs
}

fn collect_set_cookie(headers: &HeaderMap) -> String {
  headers
    .get_all(SET_COOKIE)
    .iter()
    .filter_map(|value| value.to_str().ok())
    .collect::<Vec<_>>()
    .join("; ")
}

#[tauri::command]
async fn ncm_request(request: NcmRequest) -> Result<NcmResponse, String> {
  let endpoint = request.endpoint.trim_start_matches('/');
  let base = request.base.trim_end_matches('/');
  let mut url = reqwest::Url::parse(&format!("{base}/{endpoint}"))
    .map_err(|error| format!("Invalid API url: {error}"))?;

  let method = request.method.to_uppercase();
  let cookie = request.cookie.as_deref();
  let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(15))
    .build()
    .map_err(|error| format!("Failed to create HTTP client: {error}"))?;

  let mut builder = if method == "POST" {
    client.post(url.clone())
  } else {
    append_query_pairs(&mut url, &request.params, cookie);
    client.get(url)
  };

  if let Some(cookie) = cookie.filter(|cookie| !cookie.is_empty()) {
    let value = HeaderValue::from_str(cookie).map_err(|error| format!("Invalid cookie: {error}"))?;
    builder = builder.header(COOKIE, value);
  }

  if method == "POST" {
    let form_body = value_to_form_pairs(&request.body.unwrap_or_else(|| json!({})), cookie);
    builder = builder.header(CONTENT_TYPE, "application/x-www-form-urlencoded").form(&form_body);
  }

  let response = builder
    .send()
    .await
    .map_err(|error| format!("API request failed: {error}"))?;
  let status = response.status();
  let cookie = collect_set_cookie(response.headers());
  let data = response
    .json::<Value>()
    .await
    .map_err(|error| format!("Failed to parse API response: {error}"))?;

  if !status.is_success() {
    return Err(format!("API error: {status} {data}"));
  }

  Ok(NcmResponse { data, cookie })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![ncm_request])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

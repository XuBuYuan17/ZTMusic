use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, COOKIE, USER_AGENT};
use serde_json::{json, Value};
use tauri::State;

use crate::{ApiRequest, ApiResponse, AppState, APP_USER_AGENT};

/// 允许代理的目标 API Host 白名单（精确匹配），防止 SSRF
const NETEASE_ALLOWED_HOSTS: &[&str] = &[
    "music.xubuyuan.top",
    "music.163.com",
    "interface.music.163.com",
    "interface3.music.163.com",
];

/// 精确匹配 host（不做后缀匹配，避免 `attacker-music.163.com` 这类后缀绕过）
struct ProviderPolicy {
    allowed_hosts: &'static [&'static str],
    referer: Option<&'static str>,
}

fn provider_policy(provider: Option<&str>) -> Result<ProviderPolicy, String> {
    match provider.unwrap_or("netease") {
        "netease" => Ok(ProviderPolicy {
            allowed_hosts: NETEASE_ALLOWED_HOSTS,
            referer: Some("https://music.163.com/"),
        }),
        provider => Err(format!("Unsupported API provider: {provider}")),
    }
}

fn is_allowed_host(policy: &ProviderPolicy, host: &str) -> bool {
    policy.allowed_hosts.iter().any(|allowed| host == *allowed)
}

/// SSRF 校验。两处都写成「拒绝」而非「有则查」：
/// - 取不到 host 直接拒绝——写成 `if let Some(host)` 会让任何解析异常变成放行；
/// - 端口也算 origin 的一部分，`host_str()` 不含端口，只比 host 会放行
///   `music.xubuyuan.top:8443` 这类同主机异端口的地址。
fn validate_api_url(policy: &ProviderPolicy, url: &reqwest::Url) -> Result<(), String> {
    let host = url
        .host_str()
        .ok_or_else(|| format!("API url has no host: {url}"))?;
    if !is_allowed_host(policy, host) {
        return Err(format!("API host not allowed: {host}"));
    }
    if url.port().is_some() {
        return Err(format!("API url must not specify a port: {url}"));
    }
    Ok(())
}

/// Provider 感知的 POST/GET 代理：按服务策略校验目标 host，并回传 cookie 变更。
#[tauri::command]
pub async fn api_request(
    state: State<'_, AppState>,
    request: ApiRequest,
) -> Result<ApiResponse, String> {
    let policy = provider_policy(request.provider.as_deref())?;
    let mut url = build_api_url(&request.base, &request.endpoint)?;

    // SSRF 防护：仅允许白名单内的 Host
    validate_api_url(&policy, &url)?;
    let method = request.method.to_uppercase();
    let cookie = request.cookie.as_deref();

    let mut builder = match method.as_str() {
        "GET" => {
            append_query_pairs(&mut url, &request.params, cookie);
            state.client.get(url)
        }
        "POST" => {
            // params 也要拼进 query，与浏览器路径（client.ts 的 request()）对齐：两边共用同一份
            // 调用代码，任何一侧少拼都会让 POST 的 query 参数在某个运行时静默消失。
            // 传 None 不重复附 cookie——POST 的 cookie 走表单字段，再加一份只是把登录态多泄一个地方。
            append_query_pairs(&mut url, &request.params, None);
            state.client.post(url)
        }
        _ => return Err(format!("Unsupported API method: {method}")),
    };

    builder = builder.header(USER_AGENT, APP_USER_AGENT);
    if let Some(referer) = policy.referer {
        builder = builder.header("Referer", referer);
    }

    if let Some(cookie) = cookie.filter(|cookie| !cookie.is_empty()) {
        let value =
            HeaderValue::from_str(cookie).map_err(|error| format!("Invalid cookie: {error}"))?;
        builder = builder.header(COOKIE, value);
    }

    if method == "POST" {
        let form_body = value_to_form_pairs(&request.body.unwrap_or_else(|| json!({})), cookie);
        builder = builder
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .form(&form_body);
    }

    let response = builder
        .send()
        .await
        .map_err(|error| format!("API request failed: {error}"))?;
    let status = response.status();
    let cookie = collect_set_cookie(response.headers());
    if let Some(len) = response.content_length() {
        if len > MAX_API_BODY_BYTES {
            return Err(format!("API response too large: {len} bytes"));
        }
    }
    let data = response
        .json::<Value>()
        .await
        .unwrap_or_else(|_| fallback_body(status));

    if !status.is_success() && !request.allow_error_body.unwrap_or(false) {
        return Err(format!("API error: {status} {}", truncate_for_error(&data)));
    }

    Ok(ApiResponse { data, cookie })
}

// ── helpers ────────────────────────────────────────────────

/// API 响应体上限。正常 JSON 响应几十 KB 量级，这里只挡「白名单主机返回异常大 body」。
/// ponytail: 只看 Content-Length，分块传输（不带该头）挡不住；要真封顶得改成
/// `response.chunk()` 流式累加，等真遇到再说。
const MAX_API_BODY_BYTES: u64 = 16 * 1024 * 1024;

/// 错误信息里内联的响应体截断。整段塞进 IPC 字符串既没必要，也会让报错难读。
fn truncate_for_error(value: &Value) -> String {
    const MAX_ERROR_BODY_CHARS: usize = 512;
    let text = value.to_string();
    if text.chars().count() <= MAX_ERROR_BODY_CHARS {
        return text;
    }
    let head: String = text.chars().take(MAX_ERROR_BODY_CHARS).collect();
    format!("{head}… (truncated)")
}

/// 响应体不是合法 JSON 时的兜底对象。
///
/// 关键点：HTTP 200 + 非 JSON body（HTML 错误页、空 body、中间层改写）不能用 `code: 200`，
/// 否则前端所有 `code === 200` 判定都会把它当成成功、拿到一个没有数据字段的空壳，
/// 而原始响应体已经丢了、排查时什么都看不到。浏览器路径早就用 `-1` 标记这种情况
/// （client.ts:181-185），这里保持一致。
fn fallback_body(status: reqwest::StatusCode) -> Value {
    if status.is_success() {
        json!({ "code": -1, "message": format!("API response not JSON: {status}") })
    } else {
        json!({ "code": status.as_u16(), "message": format!("API error: {status}") })
    }
}

fn value_to_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        _ => value.to_string(),
    }
}

fn build_api_url(base: &str, endpoint: &str) -> Result<reqwest::Url, String> {
    let base = base.trim_end_matches('/');
    let endpoint = endpoint.trim_start_matches('/');
    let url = reqwest::Url::parse(&format!("{base}/{endpoint}"))
        .map_err(|error| format!("Invalid API url: {error}"))?;

    match url.scheme() {
        "http" | "https" => Ok(url),
        scheme => Err(format!("Unsupported API url scheme: {scheme}")),
    }
}

fn append_query_pairs(url: &mut reqwest::Url, params: &Value, cookie: Option<&str>) {
    if let Some(map) = params.as_object() {
        let mut pairs = url.query_pairs_mut();
        for (key, value) in map {
            if value.is_null() {
                continue;
            }
            pairs.append_pair(key, &value_to_string(value));
        }
        if let Some(cookie) = cookie.filter(|cookie| !cookie.is_empty()) {
            pairs.append_pair("cookie", cookie);
        }
    }
}

fn value_to_form_pairs(body: &Value, cookie: Option<&str>) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    let body_has_cookie = body
        .as_object()
        .is_some_and(|map| map.contains_key("cookie"));
    if let Some(map) = body.as_object() {
        for (key, value) in map {
            if value.is_null() {
                continue;
            }
            pairs.push((key.clone(), value_to_string(value)));
        }
    }
    // body 里已经带了 cookie 就不要再追加：否则表单会出现两个同名字段，且两处的值不同
    // （调用方传的是原始 cookie，这里是补过 os=pc 的），服务端取哪个不确定。
    if !body_has_cookie {
        if let Some(cookie) = cookie.filter(|cookie| !cookie.is_empty()) {
            pairs.push(("cookie".to_string(), cookie.to_string()));
        }
    }
    pairs
}

fn collect_set_cookie(headers: &HeaderMap) -> String {
    headers
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .filter_map(|value| value.split(';').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("; ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::SET_COOKIE;

    #[test]
    fn collect_set_cookie_keeps_all_cookie_pairs() {
        let mut headers = HeaderMap::new();
        headers.append(
            SET_COOKIE,
            HeaderValue::from_static("MUSIC_U=token; Path=/; HttpOnly"),
        );
        headers.append(
            SET_COOKIE,
            HeaderValue::from_static("__csrf=csrf; Max-Age=3600; SameSite=Lax"),
        );
        headers.append(SET_COOKIE, HeaderValue::from_static("NMTID=nmt"));

        assert_eq!(
            collect_set_cookie(&headers),
            "MUSIC_U=token; __csrf=csrf; NMTID=nmt"
        );
    }

    #[test]
    fn collect_set_cookie_ignores_empty_and_invalid_values() {
        let mut headers = HeaderMap::new();
        headers.append(SET_COOKIE, HeaderValue::from_static(" ; Path=/"));
        headers.append(SET_COOKIE, HeaderValue::from_bytes(&[0xff]).unwrap());

        assert_eq!(collect_set_cookie(&headers), "");
    }

    #[test]
    fn fallback_body_never_reports_success_for_unparseable_json() {
        let body = fallback_body(reqwest::StatusCode::OK);
        assert_eq!(body["code"], json!(-1), "200 的非 JSON 响应不能被当成成功");

        let body = fallback_body(reqwest::StatusCode::BAD_GATEWAY);
        assert_eq!(body["code"], json!(502), "非 2xx 保留真实状态码");
    }

    #[test]
    fn validate_api_url_rejects_non_whitelisted_hosts_and_any_port() {
        let policy = provider_policy(None).expect("default provider policy");
        let ok = |raw: &str| reqwest::Url::parse(raw).expect("test url");

        assert!(validate_api_url(&policy, &ok("https://music.xubuyuan.top/a")).is_ok());
        // 默认端口不算显式端口（url crate 会归一化掉）
        assert!(validate_api_url(&policy, &ok("https://music.xubuyuan.top:443/a")).is_ok());
        assert!(validate_api_url(&policy, &ok("https://music.163.com/a")).is_ok());

        assert!(validate_api_url(&policy, &ok("https://music.xubuyuan.top:8443/a")).is_err());
        assert!(validate_api_url(&policy, &ok("https://evil.com/a")).is_err());
        assert!(validate_api_url(&policy, &ok("https://music.163.com.evil.com/a")).is_err());
        assert!(validate_api_url(&policy, &ok("https://music.xubuyuan.top@evil.com/a")).is_err());
    }

    #[test]
    fn truncate_for_error_caps_long_bodies() {
        let short = json!({ "code": 301, "msg": "need login" });
        assert_eq!(truncate_for_error(&short), short.to_string());

        // 含多字节字符时按字符截断，不能切在 UTF-8 中间
        let long = json!({ "body": "长".repeat(4096) });
        let truncated = truncate_for_error(&long);
        assert!(truncated.ends_with("… (truncated)"));
        assert!(truncated.chars().count() < 600);
    }

    #[test]
    fn value_to_form_pairs_keeps_a_single_cookie_field() {
        let body = json!({ "cookie": "MUSIC_U=raw", "timestamp": 1 });
        let pairs = value_to_form_pairs(&body, Some("MUSIC_U=raw; os=pc"));
        assert_eq!(
            pairs.iter().filter(|(key, _)| key == "cookie").count(),
            1,
            "body 已带 cookie 时不能再追加一份"
        );
        assert_eq!(pairs[0], ("cookie".to_string(), "MUSIC_U=raw".to_string()));

        let pairs = value_to_form_pairs(&json!({ "id": 1 }), Some("MUSIC_U=x"));
        assert_eq!(
            pairs,
            vec![
                ("id".to_string(), "1".to_string()),
                ("cookie".to_string(), "MUSIC_U=x".to_string()),
            ]
        );
    }

    #[test]
    fn provider_policy_defaults_to_netease_and_rejects_unknown_providers() {
        let policy = provider_policy(None).expect("default provider policy");
        assert!(is_allowed_host(&policy, "music.xubuyuan.top"));
        assert!(!is_allowed_host(&policy, "attacker-music.163.com"));
        assert!(provider_policy(Some("unknown")).is_err());
    }
}

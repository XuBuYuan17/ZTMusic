# 播放音源插件（ZT Playback Resolver v1）

哲听的账号、歌单、推荐、评论等业务数据继续由现有 Music Provider 负责；播放音源插件只参与“把一首歌解析成可播放 URL”这一件事。

## 设计原则

- 官方播放链永远优先。
- 第三方插件默认一个都不内置，也不会自动请求公共解析服务。
- 用户只能添加自己部署的服务，或服务提供者明确授权其使用的 endpoint。
- 插件可在“设置 → 音源”里启用、停用、排序和移除。
- 插件失败、超时或返回无效数据时静默跳过，不影响下一条 fallback。
- 外部插件返回的 URL 默认不写入持久缓存，降低签名 URL 泄露和过期风险。
- 客户端不提供保存 API Key / Cookie / 密码到插件 URL 的机制；需要密钥的上游应由用户自己的 gateway 保管。

## 调用时机

当前 v1 是保守 fallback：

1. 官方 Music Provider 获取播放 URL；
2. 官方 unblock / match / legacy fallback；
3. 用户启用的播放音源插件（按设置顺序）；
4. 试听片段；
5. 最终官方模板 URL。

后台补充 fallback 时，仅当当前候选不超过两条才按顺序请求所有已启用插件。因此即使歌曲已经正常播放，也可能向插件发送歌曲 ID 和音质。前台解析在第一个插件成功后停止。每个插件默认超时 2.5 秒；超时、失败或无效响应会跳过。切歌取消后丢弃旧结果，不再请求下一个插件。

## Endpoint 协议

插件 endpoint 接收 HTTP POST，请求体：

```json
{
  "protocol": "zt-playback-resolver",
  "version": 1,
  "track": {
    "providerId": "netease",
    "sourceId": 123456,
    "quality": "lossless",
    "title": "可选",
    "artists": ["可选"],
    "album": "可选",
    "durationMs": 240000
  }
}
```

v1 当前播放链保证提供：

- `providerId`
- `sourceId`
- `quality`

标题、歌手、专辑和时长字段已保留在协议中，后续播放器把完整中立 Track identity 传入 resolver 后可直接用于跨平台匹配，无需破坏协议。

成功响应可以返回单 URL：

```json
{
  "url": "https://cdn.example.com/audio.flac",
  "level": "lossless"
}
```

也可以返回 fallback 列表：

```json
{
  "urls": [
    "https://cdn-a.example.com/audio.flac",
    "https://cdn-b.example.com/audio.mp3"
  ],
  "level": "lossless"
}
```

endpoint 和播放 URL 只接受 `http:` / `https:`，均不允许内嵌用户名或密码。播放 URL 会去重。外部请求不携带浏览器凭据、不使用 HTTP 缓存、不发送 Referer，且拒绝重定向；请配置最终解析地址。插件 URL 仅用于当前播放候选，不写入 SQLite / IndexedDB；后台补齐只缓存本次取得且明确允许缓存的官方结果。

## 自托管示例

一个最小兼容服务只需要实现：

```text
POST /resolve
Content-Type: application/json
```

服务内部可以连接用户自己部署的 LX-compatible gateway、合法授权的媒体服务、本地代理或其他解析器。哲听不要求服务端使用某个特定项目。

## 浏览器与桌面 WebView 的网络要求

客户端使用前端 `fetch`，不会经过网易云 API 的 Vite 代理或 Tauri IPC 代理。自托管 endpoint 必须支持浏览器 CORS；桌面 WebView 同样需要根据运行时实际 Origin 配置跨域响应。

JSON POST 通常会先发送 OPTIONS 预检。服务端应对允许的 Origin 返回以下响应头，并在 POST 响应中同样返回 Access-Control-Allow-Origin：

```http
Access-Control-Allow-Origin: https://your-client.example
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Vary: Origin
```

示例 Origin 要替换为客户端实际 Origin（包含协议和端口）；本地开发通常为 http://localhost:5173。请求不携带 cookie，无需 Access-Control-Allow-Credentials。无认证服务如决定使用通配 Origin，应明确接受任意网页可调用它的影响。

HTTPS 网页访问普通 HTTP endpoint 或 HTTP 音频资源可能受到混合内容限制，本地网络访问也可能受到浏览器权限限制。跨平台部署优先使用 HTTPS；接受 HTTP 配置不代表所有运行时都能访问它。CORS 失败时插件会被跳过。

最小请求（无完整歌曲匹配信息）：

```json
{"protocol":"zt-playback-resolver","version":1,"track":{"providerId":"netease","sourceId":123456,"quality":"standard"}}
```

最小成功响应：

```json
{"url":"https://cdn.example.com/audio.mp3"}
```

## 后续演进

v1 有意保持简单，后续可在不破坏现有 endpoint 的情况下增加：

- 完整歌曲 identity 与跨平台 sourceIds；
- 插件 manifest / capability discovery；
- endpoint 健康检查与延迟统计；
- 按插件配置适用平台与最高音质；
- 用户选择“仅 fallback / 插件优先”等策略；
- Tauri 原生 secret store，用于需要认证的自托管 gateway；
- resolver 结果可观察性与失败原因诊断。

不计划把未经授权的公共音源服务写死进客户端。

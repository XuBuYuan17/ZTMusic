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

后台补充 fallback 时也只会在官方候选很少时调用插件，避免正常播放时把所有歌曲信息发送给外部服务。

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

只接受 `http:` / `https:` 播放 URL。

## 自托管示例

一个最小兼容服务只需要实现：

```text
POST /resolve
Content-Type: application/json
```

服务内部可以连接用户自己部署的 LX-compatible gateway、合法授权的媒体服务、本地代理或其他解析器。哲听不要求服务端使用某个特定项目。

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

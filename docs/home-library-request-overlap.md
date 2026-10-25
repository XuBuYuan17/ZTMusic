# 主页与资料库的数据请求重叠（D01 记录）

## 0. 测量方法

不数调用点，用**真实的 `api/client.ts`** 加打桩 `fetch` 记录网络请求次数：

- 脚本：`src/lib/api/client-cache.test.ts`（已加入测试套件，`node --experimental-strip-types` 可直接跑）
- 做法：`globalThis.fetch` 计数 → 调用 `ncm.*` 两次 → 断言 fetch 次数

之所以必须这样做：`api/client.ts` 带一层缓存（`cache-ttl.ts` 的 TTL + `cache-policy.ts` 的 key/读写）。**源码里有两个调用点，不代表两次网络请求**——`/user/playlist` 和 `/user/subcount` 两个调用点就只打一次网络；而 `/user/detail` 两个调用点确实打两次。

## 1. 重叠矩阵

两个加载入口：

- 主页：`pages/pc/Home.svelte` → `services/user-profile.ts#loadUserProfileData`
- 资料库：`pages/pc/Library.svelte` → `services/home.ts#loadMobileLibraryData`
  （移动端 `Library` 还会内嵌 `<HomePage profileOnly>`，于是两个入口在同一屏同时跑）

| endpoint | 主页 | 资料库 | 合并前是否有缓存 | 合并前实际网络请求 |
|---|---|---|---|---|
| `/user/playlist` | ✅ | ✅ | ✅ 5 分钟 | 1 次（命中缓存） |
| `/user/subcount` | ✅（仅自己） | ✅ | ✅ 5 分钟 | 1 次 |
| `/user/record` | ✅ | ❌ | ✅ 5 分钟 | 1 次（只有主页） |
| `/user/detail` | ✅ | ✅ | ❌ **无** | **2 次（真实重复）** |
| `/user/level` | ✅（仅自己） | ✅ | ❌ **无** | **2 次（真实重复）** |
| `/likelist` | ❌ | ✅ | ❌ 无 | 1 次（只有资料库） |
| `/user/follows`、`/user/followeds` | ✅ | ❌ | ❌ 无 | 各 1 次（只有主页） |

## 2. 合并范围与效果

只合并**确认重复且适合共享**的两项：`/user/detail`、`/user/level` —— 加进 `cache-ttl.ts` 的 5 分钟档，与同组账号资料（playlist / subcount / record）保持同一窗口。

实测数字（同一脚本，改前 / 改后）：

| 场景 | 改前 | 改后 |
|---|---|---|
| 同账号 `userDetail` ×2 | **2 次网络** | **1 次** |
| 同账号 `userPlaylist` ×2 | 1 次（既有缓存，作为「脚本确实在测网络」的对照） | 1 次 |
| 换账号后 `userDetail` | 1 次（新请求） | 1 次（缓存键含 cookie，不会读到上一账号） |
| 不同 uid `userDetail` | 1 次 | 1 次 |

**没有合并**：`likelist`（只有资料库用）、`user/follows` / `user/followeds`（只有主页用）。它们没有重复，加缓存只会扩大过期窗口。

## 3. 账号身份保护（三层）

| 层 | 机制 | 位置 |
|---|---|---|
| 网络缓存键 | 完整 cookie 参与 key，换号后 key 不同 | `cache-policy.ts#createApiCacheKey` |
| 页面快照 | 读快照前比对 `userId` | `Home.svelte` 的 `initial`、`Library.svelte` 的 `initial` |
| 过期响应 | 请求期间 owner 变了就丢弃结果，不写状态/快照 | 本轮新增：`Home.load` 的 `auth.user?.userId !== uid`、`Library.load` 的 `!== owner` |

同时修掉一个真实缺陷：`Home.save()` 之前写 `home_snapshot` 时**沿用了模块加载时的 `userId`**，换号后会把新账号的资料存到旧账号 id 下——回到旧账号就会读到新账号的资料。现在写入时取当前 `auth.user?.userId`。

## 4. 这次测量覆盖不到的部分

- 打桩 fetch 验证的是**缓存层行为**，不是真实网络的 RTT / 代理行为；真机上的请求次数还受浏览器缓存、代理重试影响。
- 只覆盖 GET 的 TTL 缓存；POST/写操作本来就走 `cache:false`，不在本次范围。
- 没有验证「同一屏内资料库 + 内嵌主页」的真实并发时序（需要浏览器），但两条路径现在共享同一个缓存键，顺序已不影响请求次数。

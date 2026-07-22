# 更新日志

本项目所有值得注意的变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.3.0] - 2026-07-22

### 新增

- 全局 Toast 通知系统：操作反馈、错误分类提示（网络/登录/超时/VIP）
- 键盘快捷键帮助面板：按 `?` 显示所有快捷键
- 播放队列"下一首播放"：将歌曲插入到当前播放之后
- 播放队列拖拽排序：HTML5 拖拽调整播放顺序
- 页面切换过渡动画：fade 150ms 平滑过渡

### 修复

- 修复 `_handleEnded` 定时器泄漏：destroy 后自动切歌导致状态冻结
- 修复 `restore()` 无 fallback：恢复会话时后台填充更多 URL
- 修复 `PlayerBar` 歌词 effect 竞态：快速切歌时歌词不加载
- 修复 `checkLoginStatus` 竞态：100ms 内重新登录被误清
- 修复 `MobileApp` $effect 状态循环依赖
- 修复 `PlaybackControls` 嵌套 $effect 重复注册
- 修复 `SongListActions` onBindRow 反复触发重渲染
- 修复移动端 UI 布局 15 项问题（头像定位、歌词溢出、空状态等）
- 删除 ~561 行死代码（旧移动端歌词页样式）

### 可访问性

- 全屏歌词页 focus-trap：焦点锁定在弹窗内
- 歌词区域 `aria-live="polite"`
- "跳到主要内容" skip-link

## [1.2.0] - 2026-07-21

### 修复

- 修复 Android CI patch 脚本 no-op 误判导致 APK 构建失败

## [1.1.0] - 2026-07-10

### 新增

- 桌面端单实例运行：再次启动时聚焦已有窗口，避免多开
- 桌面端窗口状态记忆：记住窗口大小与位置
- PC 全局键盘快捷键：播放/暂停、上一首/下一首、音量增减、静音、快进/快退
- 移动端启动前同步标记 `mobile-runtime`，消除样式闪烁（FOUC）

### 优化

- 重构响应式布局：按视口宽度判定 PC/移动，切换时联动侧栏收展
- 增强错误处理与 PC/移动端设置页、消息页交互

## [1.0.0] - 2026-07-10

### 新增

- 首个正式版本：网易云音乐第三方桌面/移动客户端
- 支持 Windows（NSIS）、Linux（deb·rpm）、Android（apk）与 Web 平台
- 登录、浏览与发现、播放、体验等核心功能

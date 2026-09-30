# 开发与提交

## 本地工作

使用 Node.js 22+ 和 pnpm，在 `dev` 分支运行 `pnpm dev` 预览 UI。首次安装依赖由开发者自行执行 `pnpm install --frozen-lockfile`；不需要为 UI 开发安装 Rust，也不在本机打安装包。

提交前运行 `pnpm check` 和 `pnpm test`。CI 负责 `pnpm verify`、Rust 编译和安装包构建。

## 分支与 PR

- 新功能和问题修复直接开发于 `dev`，或从 `dev` 创建功能分支，并把 PR 的目标设为 `dev`。
- `main` 保持稳定，开发版验证通过后提交 `dev → main` PR。默认分支仍是 `main`，创建 PR 时注意目标分支。
- `main` 的保护规则要求 PR 和 **Source checks** 通过，不要求他人审批，禁止强推和删除，管理员也遵守同一规则。
- `dev` 推送与 PR 自动生成 Windows 开发包，从对应 Actions 运行的 **Artifacts** 下载；正式发布流程见 [开发指南](docs/development.md#分支与安装包)。

## 文件放在哪里

| 目录 | 内容 |
|---|---|
| `src/`、`public/` | 应用代码和随包资源；单元测试与模块放在一起 |
| `src-tauri/` | 桌面源码、配置、图标及安装模板，供 GitHub 构建 |
| `scripts/` | CI、版本、测试及提交内容检查 |
| `scripts/maintenance/` | 可复用的 CSS 和字体维护工具 |
| `tests/` | 需要浏览器的手动集成检查 |
| `docs/`、`docs/archive/` | 当前开发文档、带日期的历史记录 |
| `.local/` | 个人实验、临时脚本和导出数据，忽略上传 |

不因目录整理移动业务模块或集中迁移现有单元测试。一次性修复脚本放到 `.local/`，复用工具放到 `scripts/maintenance/`；历史审计结果归档，不当作当前验收结论。

## 上传前检查

- 保留源码、锁文件、共享配置、测试、字体和许可证；构建产物、依赖目录及本机代理配置留在本地。
- 不提交真实 `.env`、登录 Cookie、WebDAV 凭据、私钥、签名证书、密码文件或数据库备份。环境示例使用 `.env.example`，只写变量名和占位值。
- 共享编程约定可以保留在 `.github/` 或 `CLAUDE.md`；个人代理权限设置放在被忽略的 `.codex/`，不复制到仓库。
- `node scripts/repo-hygiene.test.mjs` 会检查被 Git 跟踪的文件路径，并扫描工作文件及本次暂存内容中的常见密钥格式。它已纳入 `pnpm test`；报错只显示文件、行号和类型，不回显疑似密钥值。
- 提交前仍需查看 `git status --short`、`git diff --cached --stat` 和实际 diff。扫描只覆盖列出的常见格式，不能替代人工检查；避免 `git add -f` 强制添加被忽略的文件。

`.gitignore` 只影响未跟踪文件。已提交的敏感信息即使取消跟踪，仍存在于历史中；如发现真实泄露，先撤销或轮换凭据，再单独处理历史记录。

## 维护工具

在仓库根目录运行：

```bash
node scripts/maintenance/find-dead-css.mjs
node scripts/maintenance/prune-dead-css.mjs --dry
node scripts/maintenance/converge-font-weight.mjs --dry
node scripts/maintenance/converge-border-radius.mjs --dry
```

以上命令只检查或预览，实际写入前审阅输出。字体完整性工具通过 PowerShell 7 执行，原始字体压缩包由参数传入，不把压缩包或个人路径提交到仓库：

```powershell
pwsh -NoProfile -File scripts/maintenance/verify-font-integrity.ps1 -ArchivePath '<原始字体压缩包路径>'
```

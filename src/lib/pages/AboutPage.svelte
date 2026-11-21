<script lang="ts">
  import pkg from '../../../package.json'
  import appIcon from '../../../src-tauri/icons/icon.png'
  import { checkForUpdates, RELEASES_URL, type UpdateResult } from '../services/update-check.ts'
  import { openExternal } from '../utils/open-external.ts'

  const appVersion = pkg.version
  const repositoryUrl = 'https://github.com/XuBuYuan17/ZTMusic'
  const contributors = [
    { name: 'XuBuYuan17（本人）', url: 'https://github.com/XuBuYuan17' },
    { name: 'Claude Code', url: 'https://claude.com/product/claude-code' },
    { name: 'ChatGPT', url: 'https://chatgpt.com/' },
    { name: 'DeepSeek', url: 'https://www.deepseek.com/' },
    { name: 'LongChat', url: 'https://github.com/lm-sys/LongChat' },
  ]
  const stack = [
    { name: 'Svelte 5', note: '界面与状态' },
    { name: 'Vite 8', note: '构建' },
    { name: 'Tauri 2', note: '桌面外壳' },
    { name: 'Rust', note: '原生桥接' },
    { name: 'TypeScript', note: '类型' },
    { name: 'Motion', note: '动画' },
    { name: 'SQLocal', note: '本地存储' },
  ]
  let checking = $state(false)
  let update = $state<UpdateResult | null>(null)
  let updateError = $state('')
  let linkError = $state('')

  const updateMessage = $derived.by(() => {
    if (updateError) return updateError
    if (!update) return ''
    if (update.status === 'none') return '暂无正式发布版本'
    if (update.status === 'newer') return `发现正式版本 ${update.version}`
    if (update.status === 'same') return `当前版本号与正式版 ${update.version} 一致`
    if (update.status === 'ahead') return `当前版本号高于正式版 ${update.version}`
    return `最新正式版：${update.version}，请前往发布页查看`
  })

  async function checkUpdates(): Promise<void> {
    if (checking) return
    checking = true
    update = null
    updateError = ''
    try { update = await checkForUpdates(appVersion) }
    catch { updateError = '检查失败，请检查网络后重试' }
    finally { checking = false }
  }

  function openLink(url: string): void {
    linkError = ''
    void openExternal(url).catch(() => { linkError = '无法打开链接，请稍后重试' })
  }
</script>

<div class="about-page fade-in">
  <header class="about-head">
    <img class="about-icon" src={appIcon} alt="" />
    <div class="about-identity">
      <div class="about-title"><h1>哲听</h1><span class="about-version">v{appVersion}</span></div>
      <p>一个安静的网易云音乐客户端</p>
    </div>
  </header>

  <section class="about-section" aria-label="版本与更新">
    <button class="about-row" type="button" onclick={checkUpdates} disabled={checking}>
      <span><strong>检查更新</strong><small>对比最新正式版本</small></span>
      <span class="about-action">{checking ? '检查中…' : '检查'}</span>
    </button>
    {#if updateMessage}<p class="about-update-status" role="status">{updateMessage}</p>{/if}
    {#if update && update.status !== 'none'}
      <button class="about-row" type="button" onclick={() => openLink(RELEASES_URL)}><span><strong>版本发布页</strong><small>查看更新和可用安装包</small></span></button>
    {/if}
  </section>

  <section class="about-section" aria-label="社区与项目">
    <div class="about-row about-row--static"><span><strong>群组</strong></span><span class="about-secondary">暂无群组</span></div>
    <button class="about-row" type="button" onclick={() => openLink(repositoryUrl)}><span><strong>项目主页</strong><small>GitHub · ZTMusic</small></span></button>
  </section>
  {#if linkError}<p class="about-error" role="alert">{linkError}</p>{/if}

  <section class="about-card" aria-labelledby="about-contributors">
    <h2 id="about-contributors">贡献者</h2>
    <div class="about-contributors">{#each contributors as contributor}<button type="button" title={contributor.url} onclick={() => openLink(contributor.url)}>{contributor.name}</button>{/each}</div>
  </section>

  <section class="about-card" aria-labelledby="about-author">
    <h2 id="about-author">作者的话</h2>
    <p>最初只是想给自己做一个安静的听歌工具，后来慢慢有了更多功能。希望你能在这里找到喜欢的音乐，也欢迎一起参与改进。</p>
  </section>

  <section class="about-card" aria-labelledby="about-disclaimer">
    <h2 id="about-disclaimer">免责声明</h2>
    <p>哲听不提供音乐内容本身，播放、登录、歌单和歌词等能力来自第三方接口与网易云账号状态。音乐版权归网易云音乐及各版权方所有。</p>
    <p>本项目仅供个人学习与技术交流，请勿用于商业用途。使用时请遵守相关服务条款和版权规则。</p>
  </section>

  <section class="about-card" aria-labelledby="about-stack">
    <h2 id="about-stack">技术栈与开源</h2>
    <div class="about-stack">{#each stack as item}<div><strong>{item.name}</strong><small>{item.note}</small></div>{/each}</div>
    <div class="about-licenses">
      <p>本应用使用 HarmonyOS Sans 字体，Copyright 2021 Huawei Device Co., Ltd.，依 HarmonyOS Sans Fonts License Agreement 授权随包分发，字体文件未经修改。完整条款见 <code>fonts/HarmonyOS-Sans-LICENSE.txt</code>。</p>
      <p>部分图标使用 Material Symbols，遵循 Apache License 2.0；许可文件见 <code>licenses/Material-Symbols-LICENSE.txt</code>。</p>
      <button class="about-inline-link" type="button" onclick={() => openLink('https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced')}>NeteaseCloudMusicApi Enhanced</button>
    </div>
  </section>
</div>

<style>
  .about-page { display: grid; gap: 14px; max-width: 820px; margin: 0 auto; padding-bottom: 28px; }

  .about-head { display: flex; align-items: center; gap: 18px; padding: 6px 2px 20px; }
  .about-icon { display: block; flex: none; width: 76px; height: 76px; object-fit: cover; border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
  .about-identity { min-width: 0; display: grid; gap: 6px; }
  .about-title { display: flex; align-items: center; gap: 10px; }
  .about-title h1 { margin: 0; font-size: 26px; line-height: 1.2; }
  .about-version { flex: none; padding: 3px 9px; border-radius: 999px; background: var(--bg-elevated); color: var(--text-secondary); font-size: 11px; font-variant-numeric: tabular-nums; }
  .about-identity p { margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.5; }

  .about-section, .about-card { min-width: 0; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-surface); overflow: hidden; }
  .about-row { box-sizing: border-box; width: 100%; min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 13px 16px; border: 0; background: transparent; color: var(--text); text-align: left; font: inherit; transition: background-color var(--dur-fast) var(--ease-out); }
  .about-row + .about-row { border-top: 1px solid var(--border); }
  .about-row > span:first-child { min-width: 0; display: grid; gap: 3px; }
  .about-row strong { font-size: 14px; font-weight: 500; }
  .about-row small, .about-secondary { color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
  .about-row--static { cursor: default; }
  .about-action, .about-inline-link { color: var(--accent); font-size: 13px; font-weight: 500; }
  .about-row:not(:disabled):is(:hover, :focus-visible) { background: var(--bg-hover); }
  .about-row:disabled { opacity: .65; }
  .about-update-status { margin: 0; padding: 0 16px 13px; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
  .about-error { margin: 0; color: var(--danger); font-size: 12px; }

  .about-card { display: grid; gap: 12px; padding: 18px 16px; }
  .about-card h2 { margin: 0; color: var(--text-secondary); font-size: 12px; font-weight: 500; letter-spacing: .02em; }
  .about-card p { margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.75; }
  .about-card code { padding: 1px 5px; border-radius: var(--radius-xs); background: var(--bg-elevated); color: var(--text); font-size: 11px; overflow-wrap: anywhere; }

  .about-contributors { display: flex; flex-wrap: wrap; gap: 8px; }
  .about-contributors button { padding: 6px 12px; border: 1px solid var(--border); border-radius: 999px; background: transparent; color: var(--text); font: inherit; font-size: 12px; line-height: 1.4; transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out); }
  .about-contributors button:hover { border-color: var(--accent); color: var(--accent); }

  .about-stack { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 1px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--border); overflow: hidden; }
  .about-stack > div { display: grid; gap: 3px; padding: 11px 13px; background: var(--bg-surface); }
  .about-stack strong { font-size: 13px; font-weight: 500; color: var(--text); }
  .about-stack small { font-size: 11px; color: var(--text-tertiary); line-height: 1.2; }

  .about-licenses { display: grid; gap: 10px; padding-top: 12px; border-top: 1px solid var(--border); }
  .about-licenses p { color: var(--text-tertiary); font-size: 12px; line-height: 1.7; }
  .about-inline-link { justify-self: start; min-height: 32px; padding: 0; background: transparent; text-align: left; }
  .about-inline-link:hover { text-decoration: underline; }

  .about-row:focus-visible, .about-inline-link:focus-visible, .about-contributors button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  @media (max-width: 720px) {
    .about-page { gap: 12px; }
    .about-head { padding: 4px 0 14px; gap: 14px; }
    .about-icon { width: 64px; height: 64px; }
    .about-title h1 { font-size: 23px; }
    .about-stack { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>

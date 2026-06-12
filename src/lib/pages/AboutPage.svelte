<script>
  import { DEFAULT_API_BASE } from '../api/client.js'
  import pkg from '../../../package.json'

  const appVersion = pkg.version

  const overviewItems = [
    ['版本', `v${appVersion}`],
    ['形态', 'Svelte + Tauri 桌面客户端'],
    ['服务', '网易云音乐第三方 API'],
  ]

  const projectLinks = [
    {
      type: 'repo',
      label: '客户端仓库',
      name: 'ZTmusic / 哲听',
      desc: '界面、播放器、桌面端打包和应用配置。',
      url: 'https://github.com/xubuyuan18/ZTmusic',
      owner: 'xubuyuan18',
      repo: 'ZTmusic',
      language: 'Svelte',
    },
    {
      type: 'repo',
      label: '特别感谢',
      name: 'NeteaseCloudMusicApi Enhanced',
      desc: '账号、歌单、搜索、歌词、播放地址等网易云接口能力。',
      url: 'https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced',
      owner: 'NeteaseCloudMusicApiEnhanced',
      repo: 'api-enhanced',
      language: 'JavaScript',
    },
  ]

  const techStack = [
    ['Svelte 5', '界面和响应式状态'],
    ['Vite 8', '开发服务器与构建'],
    ['Tauri 2', '桌面应用外壳'],
    ['Rust', '本地请求桥'],
    ['HTML5 Audio', '播放内核'],
    ['pnpm', '依赖管理'],
  ]
</script>

<div class="about-page fade-in">
  <section class="about-hero" aria-labelledby="about-title">
    <div class="about-brand-mark" aria-hidden="true">ZT</div>
    <div class="about-hero-copy">
      <span class="about-kicker">About</span>
      <h1 id="about-title">哲听</h1>
      <p>一个简洁、安静的网易云音乐第三方桌面客户端，专注歌单、推荐、播放和日常听歌体验。</p>
    </div>
  </section>

  <section class="about-overview" aria-label="应用概览">
    {#each overviewItems as [label, value]}
      <div class="about-stat">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    {/each}
  </section>

  <section class="about-panel" aria-labelledby="about-tech-title">
    <div class="about-section-head">
      <span>Stack</span>
      <h2 id="about-tech-title">技术组成</h2>
    </div>

    <div class="about-tech-list">
      {#each techStack as [name, desc]}
        <div class="about-tech-item">
          <strong>{name}</strong>
          <span>{desc}</span>
        </div>
      {/each}
    </div>
  </section>

  <section class="about-panel" aria-labelledby="about-links-title">
    <div class="about-section-head inline">
      <div>
        <span>Links</span>
        <h2 id="about-links-title">相关链接</h2>
      </div>
    </div>

    <div class="about-link-grid">
      {#each projectLinks as item}
        <a
          class:about-link-card={item.type !== 'repo'}
          class:about-repo-card={item.type === 'repo'}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`${item.label}：${item.name}`}
        >
          {#if item.type === 'repo'}
            <span class="about-repo-label">{item.label}</span>
            <div class="about-repo-head">
              <span class="about-repo-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" role="img">
                  <path
                    d="M2.75 1A1.75 1.75 0 0 0 1 2.75v10.5A1.75 1.75 0 0 0 2.75 15h10.5A1.75 1.75 0 0 0 15 13.25V2.75A1.75 1.75 0 0 0 13.25 1H2.75Zm0 1.5h10.5a.25.25 0 0 1 .25.25v10.5a.25.25 0 0 1-.25.25H2.75a.25.25 0 0 1-.25-.25V2.75a.25.25 0 0 1 .25-.25Zm2 2.25A.75.75 0 0 1 5.5 4h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75Zm0 3A.75.75 0 0 1 5.5 7h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75Zm0 3a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1-.75-.75Z"
                  />
                </svg>
              </span>
              <strong>{item.owner}</strong>
            </div>
            <div class="about-repo-name">{item.repo}</div>
            <p>{item.desc}</p>
            <div class="about-repo-meta" aria-label={`主要语言：${item.language}`}>
              <span class="about-repo-dot"></span>
              <span>{item.language}</span>
            </div>
          {:else}
            <span>{item.label}</span>
            <strong>{item.name}</strong>
            <em>{item.desc}</em>
          {/if}
        </a>
      {/each}
    </div>
  </section>

  <section class="about-note" aria-labelledby="about-note-title">
    <div class="about-section-head">
      <span>Note</span>
      <h2 id="about-note-title">一点说明</h2>
    </div>
    <p>
      哲听的目标不是做一个很重的音乐平台，而是做一个打开就能听、切换顺手、信息不打扰音乐本身的桌面窗口。
    </p>
    <p>
      项目仍在持续整理体验细节，包括登录、缓存、播放失败兜底、歌词和资料库等部分。第三方接口能力来自社区项目，使用时请尊重对应服务和版权规则。
    </p>
  </section>
</div>

<style>
  .about-page {
    display: grid;
    gap: 16px;
  }

  .about-hero {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 18px;
    padding: 22px 0 18px;
    border-bottom: 1px solid var(--border);
  }

  .about-brand-mark {
    display: grid;
    place-items: center;
    width: 76px;
    height: 76px;
    border-radius: var(--r-lg);
    background: var(--accent);
    color: #fff;
    box-shadow: 0 14px 30px color-mix(in srgb, var(--accent) 24%, transparent);
    font-size: 25px;
    font-weight: 850;
    letter-spacing: 0;
  }

  .about-kicker,
  .about-section-head span,
  .about-stat span,
  .about-link-card span {
    color: var(--accent);
    font-size: 12px;
    font-weight: 820;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .about-hero-copy h1 {
    margin: 5px 0 8px;
    font-size: clamp(34px, 4vw, 48px);
    line-height: 1;
    letter-spacing: 0;
  }

  .about-hero-copy p,
  .about-section-head p,
  .about-note p,
  .about-tech-item span,
  .about-link-card em {
    color: var(--text-secondary);
  }

  .about-hero-copy p {
    max-width: 600px;
    font-size: 14px;
    line-height: 1.75;
  }

  .about-overview {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    overflow: hidden;
    background: color-mix(in srgb, var(--bg-elevated) 70%, transparent);
  }

  .about-stat {
    display: grid;
    gap: 8px;
    min-width: 0;
    padding: 16px 18px;
    border-right: 1px solid var(--border);
  }

  .about-stat:last-child {
    border-right: none;
  }

  .about-stat strong {
    overflow: hidden;
    font-size: 15px;
    font-weight: 760;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .about-panel,
  .about-note {
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: color-mix(in srgb, var(--bg-elevated) 68%, transparent);
    backdrop-filter: blur(20px) saturate(150%);
    -webkit-backdrop-filter: blur(20px) saturate(150%);
  }

  .about-panel {
    padding: 18px;
  }

  .about-section-head {
    display: grid;
    gap: 6px;
    margin-bottom: 15px;
  }

  .about-section-head.inline {
    grid-template-columns: minmax(0, auto) minmax(260px, 520px);
    align-items: end;
    justify-content: space-between;
    gap: 18px;
  }

  .about-section-head h2 {
    margin: 0;
    font-size: 18px;
    letter-spacing: 0;
  }

  .about-section-head p {
    margin: 0;
    font-size: 13px;
    line-height: 1.65;
    text-align: right;
  }

  .about-link-card:hover {
    text-decoration: none;
  }

  .about-tech-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .about-tech-item {
    display: grid;
    gap: 5px;
    min-height: 70px;
    padding: 13px;
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: color-mix(in srgb, var(--bg-layer) 54%, transparent);
  }

  .about-tech-item strong {
    font-size: 14px;
  }

  .about-tech-item span {
    font-size: 12px;
    line-height: 1.45;
  }

  .about-link-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .about-link-card {
    display: grid;
    align-content: start;
    gap: 8px;
    min-height: 132px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: color-mix(in srgb, var(--bg-layer) 52%, transparent);
    color: var(--text);
    transition: border-color 0.16s, background 0.16s, transform 0.16s;
  }

  .about-repo-card {
    display: grid;
    align-content: start;
    gap: 8px;
    min-height: 132px;
    padding: 15px;
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--bg-layer) 72%, transparent), transparent 86%),
      color-mix(in srgb, var(--bg-elevated) 76%, transparent);
    color: var(--text);
    transition: border-color 0.16s, background 0.16s, transform 0.16s;
  }

  .about-link-card:hover,
  .about-repo-card:hover {
    border-color: color-mix(in srgb, var(--accent) 36%, var(--border));
    background: color-mix(in srgb, var(--bg-layer) 78%, transparent);
    transform: translateY(-1px);
    text-decoration: none;
  }

  .about-link-card strong {
    font-size: 15px;
    line-height: 1.35;
  }

  .about-link-card em {
    font-size: 12px;
    font-style: normal;
    line-height: 1.55;
  }

  .about-repo-label {
    width: fit-content;
    padding: 3px 7px;
    border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
    border-radius: 999px;
    color: var(--accent);
    font-size: 11px;
    font-weight: 820;
    line-height: 1;
  }

  .about-repo-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .about-repo-icon {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    color: var(--text-secondary);
  }

  .about-repo-icon svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
  }

  .about-repo-head strong,
  .about-repo-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .about-repo-head strong {
    font-size: 12px;
    font-weight: 680;
    color: var(--text-secondary);
  }

  .about-repo-name {
    color: var(--accent);
    font-size: 16px;
    font-weight: 820;
  }

  .about-repo-card p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }

  .about-repo-meta {
    display: inline-grid;
    grid-template-columns: auto auto;
    align-items: center;
    justify-content: start;
    gap: 6px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .about-repo-dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: #f1e05a;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  }

  .about-note {
    display: grid;
    gap: 10px;
    padding: 18px;
  }

  .about-note .about-section-head {
    margin-bottom: 2px;
  }

  .about-note p {
    max-width: 880px;
    margin: 0;
    font-size: 14px;
    line-height: 1.8;
  }

  @media (max-width: 980px) {
    .about-link-grid {
      grid-template-columns: 1fr;
    }

    .about-section-head.inline {
      grid-template-columns: 1fr;
    }

    .about-section-head p {
      text-align: left;
    }
  }

  @media (max-width: 720px) {
    .about-hero,
    .about-overview,
    .about-tech-list {
      grid-template-columns: 1fr;
    }

    .about-hero {
      align-items: start;
      padding-top: 6px;
    }

    .about-stat {
      border-right: none;
      border-bottom: 1px solid var(--border);
    }

    .about-stat:last-child {
      border-bottom: none;
    }
  }

  @media (max-width: 560px) {
    .about-panel,
    .about-note {
      padding: 16px;
    }
  }
</style>

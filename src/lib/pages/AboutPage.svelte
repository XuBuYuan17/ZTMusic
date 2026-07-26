<script>
  import { DEFAULT_API_BASE } from '../api/client.js'
  import pkg from '../../../package.json'

  const appVersion = pkg.version

  const info = [
    ['版本', `v${appVersion}`],
    ['前端', 'Svelte / Vite'],
    ['桌面端', 'Tauri'],
    ['API', DEFAULT_API_BASE],
  ]

  const links = [
    ['客户端源码', 'https://github.com/xubuyuan18/ZTmusic'],
    ['NeteaseCloudMusicApi Enhanced', 'https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced'],
  ]
</script>

<div class="about-page fade-in">
  <section class="about-head" aria-labelledby="about-title">
    <div class="about-icon" aria-hidden="true">哲</div>
    <div class="about-title-block">
      <h1 id="about-title">哲听</h1>
      <p>一个简洁、安静的跨平台音乐客户端，专注于听歌、整理歌单和阅读歌词。</p>
    </div>
  </section>

  <section class="about-card" aria-labelledby="about-info-title">
    <h2 id="about-info-title">应用信息</h2>
    <dl class="about-info-list">
      {#each info as [label, value]}
        <div>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      {/each}
    </dl>
  </section>

  <section class="about-card" aria-labelledby="about-links-title">
    <h2 id="about-links-title">相关项目</h2>
    <div class="about-link-list">
      {#each links as [label, url]}
        <a href={url} target="_blank" rel="noreferrer">
          <span>{label}</span>
          <small>{url.replace('https://github.com/', '')}</small>
        </a>
      {/each}
    </div>
  </section>

  <section class="about-card about-note" aria-labelledby="about-note-title">
    <h2 id="about-note-title">说明</h2>
    <p>
      哲听不提供音乐内容本身，播放、登录、歌单、歌词等能力来自接口服务和你的网易云账号状态。VIP、灰色歌曲、版权和地区限制以接口返回为准。
    </p>
    <p>
      项目仅用于学习和个人使用。使用时请遵守相关服务条款和版权规则。
    </p>
  </section>
</div>

<style>
  .about-page {
    display: grid;
    gap: 16px;
    max-width: 820px;
    padding-bottom: 24px;
  }

  .about-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 18px;
    padding: 8px 0 18px;
    border-bottom: 1px solid var(--border);
  }

  .about-icon {
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
    border-radius: 18px;
    background: var(--accent);
    color: #fff;
    font-size: 30px;
    font-weight: 820;
    letter-spacing: 0;
  }

  .about-title-block {
    min-width: 0;
  }

  .about-title-block h1 {
    margin: 0 0 8px;
    font-size: 34px;
    line-height: 1;
    letter-spacing: 0;
  }

  .about-title-block p,
  .about-note p,
  .about-link-list small {
    color: var(--text-secondary);
  }

  .about-title-block p {
    max-width: 620px;
    margin: 0;
    font-size: 15px;
    line-height: 1.7;
  }

  .about-card {
    display: grid;
    gap: 14px;
    padding: 18px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: color-mix(in srgb, var(--bg-elevated) 70%, transparent);
  }

  .about-card h2 {
    margin: 0;
    font-size: 17px;
    line-height: 1.25;
    letter-spacing: 0;
  }

  .about-info-list {
    display: grid;
    gap: 0;
    margin: 0;
  }

  .about-info-list div {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    gap: 12px;
    padding: 11px 0;
    border-top: 1px solid var(--border);
  }

  .about-info-list div:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .about-info-list div:last-child {
    padding-bottom: 0;
  }

  .about-info-list dt {
    color: var(--text-tertiary);
    font-size: 13px;
  }

  .about-info-list dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--text);
    font-size: 13px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .about-link-list {
    display: grid;
    gap: 10px;
  }

  .about-link-list a {
    display: grid;
    gap: 4px;
    padding: 12px 0;
    border-top: 1px solid var(--border);
    color: var(--text);
  }

  .about-link-list a:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .about-link-list a:last-child {
    padding-bottom: 0;
  }

  .about-link-list a:hover {
    color: var(--accent);
    text-decoration: none;
  }

  .about-link-list span {
    font-size: 14px;
    font-weight: 700;
  }

  .about-link-list small {
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .about-note p {
    margin: 0;
    font-size: 14px;
    line-height: 1.75;
  }

  @media (max-width: 720px) {
    .about-page {
      max-width: none;
      gap: 14px;
    }

    .about-head {
      grid-template-columns: 1fr;
      align-items: start;
    }

    .about-info-list div {
      grid-template-columns: 72px minmax(0, 1fr);
    }
  }
</style>

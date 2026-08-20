<script>
  import { onMount } from 'svelte'
  import { dbHistory } from '../db/history.js'
  import { EMPTY_LOCAL_LISTENING_STATS, summarizeLocalListening } from '../services/listening-stats.js'
  import { coverUrl } from '../utils/image.js'
  import Icon from '../components/ui/Icon.svelte'

  let history = $state([])
  let stats = $state({ ...EMPTY_LOCAL_LISTENING_STATS })
  let loading = $state(true)
  let error = $state('')

  const topTracks = $derived(
    [...history]
      .sort((a, b) => (Number(b.playCount) || 1) - (Number(a.playCount) || 1) || (Number(b.playedAt) || 0) - (Number(a.playedAt) || 0))
      .slice(0, 5)
  )
  const coverStack = $derived(history.slice(0, 4).map(track => track.picUrl).filter(Boolean))
  const averageLabel = $derived(stats.playCount ? `${Math.round(stats.totalDuration / stats.playCount / 60_000)} 分钟` : '0 分钟')

  function artistsOf(track) {
    return (track?.artists || track?.ar || [])
      .map(artist => typeof artist === 'string' ? artist : artist?.name)
      .filter(Boolean)
      .join(' / ') || '未知艺术家'
  }

  async function load() {
    loading = true
    error = ''
    try {
      const list = await dbHistory.list(200)
      history = list
      stats = summarizeLocalListening(list)
    } catch (e) {
      error = e?.message || '加载失败'
      history = []
      stats = { ...EMPTY_LOCAL_LISTENING_STATS }
    } finally {
      loading = false
    }
  }

  onMount(() => {
    load()
    const refresh = () => load()
    window.addEventListener('local-listening-history-change', refresh)
    return () => window.removeEventListener('local-listening-history-change', refresh)
  })
</script>

<div class="listening-poster-page">
  <section class="listening-poster">
    <div class="poster-glow"></div>
    <header class="poster-header">
      <div>
        <span>On This Device</span>
        <h1>本地听歌统计</h1>
      </div>
      <div class="poster-mark">
        <Icon name="music" size={26} strokeWidth={1.6} />
      </div>
    </header>

    {#if loading}
      <div class="poster-empty">正在整理你的播放足迹</div>
    {:else if error}
      <div class="poster-empty">
        <p>{error}</p>
        <button onclick={load}>重试</button>
      </div>
    {:else if stats.trackCount === 0}
      <div class="poster-empty">
        <strong>还没有记录</strong>
        <p>播放一首歌后，这里会生成只属于这台设备的听歌海报。</p>
      </div>
    {:else}
      <div class="poster-main">
        <div class="poster-number">
          <strong>{stats.playCount}</strong>
          <span>次播放</span>
        </div>
        <div class="poster-covers" aria-hidden="true">
          {#each coverStack as cover, index}
            <img src={coverUrl(cover, 220)} alt="" style={`--i:${index}`} loading="lazy" referrerpolicy="no-referrer" />
          {/each}
          {#if coverStack.length === 0}
            <div class="poster-cover-placeholder"><Icon name="music" size={42} strokeWidth={1.4} /></div>
          {/if}
        </div>
      </div>

      <div class="poster-stats">
        <article>
          <strong>{stats.durationLabel}</strong>
          <span>累计时长</span>
        </article>
        <article>
          <strong>{stats.activeDays}</strong>
          <span>活跃天数</span>
        </article>
        <article>
          <strong>{averageLabel}</strong>
          <span>单次平均</span>
        </article>
      </div>

      <div class="poster-line">
        <span>常听艺术家</span>
        <strong>{stats.topArtist}</strong>
      </div>

      <div class="poster-top">
        <span>Top Tracks</span>
        {#each topTracks as track, index (track.id)}
          <div class="poster-track">
            <em>{String(index + 1).padStart(2, '0')}</em>
            {#if track.picUrl}
              <img src={coverUrl(track.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
            {:else}
              <div class="poster-mini-placeholder"><Icon name="music" size={16} strokeWidth={1.4} /></div>
            {/if}
            <div>
              <strong>{track.name}</strong>
              <small>{artistsOf(track)} · {track.playCount || 1} 次</small>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .listening-poster-page {
    min-height: min(820px, calc(100vh - 120px));
    display: grid;
    place-items: center;
    padding: 24px;
  }

  .listening-poster {
    position: relative;
    width: min(620px, 100%);
    min-height: 760px;
    overflow: hidden;
    border-radius: var(--radius-sm);
    padding: 34px;
    color: #fff;
    background:
      radial-gradient(circle at 18% 16%, rgba(255, 45, 85, 0.42), transparent 30%),
      radial-gradient(circle at 84% 6%, rgba(48, 209, 88, 0.32), transparent 28%),
      linear-gradient(155deg, #181818 0%, #101010 48%, #251115 100%);
    border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 28px 80px rgba(0,0,0,0.42);
  }

  .poster-glow {
    position: absolute;
    inset: auto -80px -110px 20%;
    height: 260px;
    background: linear-gradient(90deg, rgba(255, 55, 95, 0.36), rgba(255,255,255,0.08));
    filter: blur(46px);
    transform: rotate(-8deg);
  }

  .poster-header,
  .poster-main,
  .poster-stats,
  .poster-line,
  .poster-top,
  .poster-empty {
    position: relative;
    z-index: 1;
  }

  .poster-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
  }

  .poster-header span,
  .poster-top > span,
  .poster-line span {
    color: #ff375f;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .poster-header h1 {
    margin-top: 8px;
    font-size: 38px;
    line-height: 1.04;
    font-weight: 700;
  }

  .poster-mark {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.16);
  }

  .poster-main {
    margin-top: 52px;
    display: grid;
    grid-template-columns: 1fr 210px;
    gap: 22px;
    align-items: center;
  }

  .poster-number strong {
    display: block;
    font-size: clamp(84px, 16vw, 132px);
    line-height: 0.88;
    font-weight: 700;
  }

  .poster-number span {
    color: rgba(255,255,255,0.72);
    font-size: 18px;
    font-weight: 700;
  }

  .poster-covers {
    position: relative;
    height: 230px;
  }

  .poster-covers img,
  .poster-cover-placeholder {
    position: absolute;
    width: 136px;
    height: 136px;
    border-radius: var(--radius-sm);
    object-fit: cover;
    border: 1px solid rgba(255,255,255,0.18);
    box-shadow: 0 18px 42px rgba(0,0,0,0.36);
    transform: translate(calc(var(--i) * 20px), calc(var(--i) * 22px)) rotate(calc((var(--i) - 1.5) * 7deg));
  }

  .poster-cover-placeholder {
    display: grid;
    place-items: center;
    background: rgba(255,255,255,0.08);
  }

  .poster-stats {
    margin-top: 40px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .poster-stats article {
    min-height: 88px;
    padding: 14px;
    border-radius: var(--radius-sm);
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
  }

  .poster-stats strong,
  .poster-line strong {
    display: block;
    font-size: 20px;
    font-weight: 700;
  }

  .poster-stats span {
    display: block;
    margin-top: 8px;
    color: rgba(255,255,255,0.62);
    font-size: 12px;
  }

  .poster-line {
    margin-top: 18px;
    padding: 18px;
    border-radius: var(--radius-sm);
    background: rgba(255, 55, 95, 0.12);
    border: 1px solid rgba(255, 55, 95, 0.22);
  }

  .poster-line strong {
    margin-top: 8px;
    font-size: 28px;
  }

  .poster-top {
    margin-top: 26px;
    display: grid;
    gap: 8px;
  }

  .poster-track {
    display: grid;
    grid-template-columns: 34px 48px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    min-height: 62px;
  }

  .poster-track em {
    color: rgba(255,255,255,0.42);
    font-style: normal;
    font-weight: 700;
  }

  .poster-track img,
  .poster-mini-placeholder {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-sm);
    object-fit: cover;
    background: rgba(255,255,255,0.08);
  }

  .poster-mini-placeholder {
    display: grid;
    place-items: center;
  }

  .poster-track strong,
  .poster-track small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .poster-track strong {
    font-size: 14px;
    font-weight: 700;
  }

  .poster-track small {
    margin-top: 2px;
    color: rgba(255,255,255,0.58);
    font-size: 12px;
  }

  .poster-empty {
    min-height: 520px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 10px;
    text-align: center;
    color: rgba(255,255,255,0.7);
  }

  .poster-empty strong {
    color: #fff;
    font-size: 28px;
  }

  .poster-empty p {
    max-width: 320px;
    line-height: 1.6;
  }

  .poster-empty button {
    height: 38px;
    padding: 0 18px;
    border-radius: 999px;
    background: #ff375f;
    color: #fff;
    font-weight: 700;
  }

  @media (max-width: 760px) {
    .listening-poster-page {
      min-height: 100%;
      padding: 16px;
    }

    .listening-poster {
      min-height: 720px;
      padding: 24px;
    }

    .poster-main {
      grid-template-columns: 1fr;
      margin-top: 36px;
    }

    .poster-covers {
      height: 172px;
    }

    .poster-covers img,
    .poster-cover-placeholder {
      width: 108px;
      height: 108px;
    }

    .poster-stats {
      grid-template-columns: 1fr;
      margin-top: 22px;
    }
  }
</style>


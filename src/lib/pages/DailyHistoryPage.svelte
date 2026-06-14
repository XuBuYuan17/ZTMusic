<script>
  import { player } from '../stores/player.svelte.js'
  import { formatDuration } from '../format.js'
  import { coverUrl } from '../utils/image.js'
  import { extractCover } from '../utils/normalize.js'
  import SongListActions from '../components/SongListActions.svelte'

  let {
    dailyHistoryDates = [],
    dailyHistorySongs = [],
    dailyHistoryLoading = false,
    selectedDailyDate = '',
    onSelectDate,
    onPlayAll,
    onPlayTrack,
    onOpenArtist,
    onOpenAlbum,
  } = $props()

  let songActions = $state(null)

  function artistsOf(track) {
    return track.artists || track.ar || []
  }

  function coverOf(track) {
    return track?.picUrl || extractCover(track)
  }

  function albumOf(track) {
    return track.album?.name || track.al?.name || ''
  }

  function handleSongKeydown(event, track) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPlayTrack?.(track)
    }
  }

  function formatDateLabel(date) {
    if (!date) return '选择日期'
    const parts = String(date).split('-')
    return parts.length === 3 ? `${parts[1]}.${parts[2]}` : date
  }

  const selectedDateMeta = $derived(dailyHistoryDates.find(item => (item.date || item) === selectedDailyDate) || null)
  const heroSong = $derived(dailyHistorySongs[0] || null)
  const heroCover = $derived(coverOf(heroSong) || '')
</script>

<div class="daily-page fade-in">
  <section class="daily-hero">
    {#key selectedDailyDate + heroCover}
      <div class="daily-hero-bg" style={heroCover ? `background-image:url(${coverUrl(heroCover, 900)})` : ''}></div>
    {/key}
    <div class="daily-hero-shade"></div>
    <div class="daily-hero-copy">
      <div class="daily-kicker">Daily Archive</div>
      <h1>历史日推</h1>
      <p>回看每天为你推送过的歌曲，把错过的那一首重新捡回来。</p>
      <div class="daily-hero-stats" data-date={selectedDailyDate}>
        <span>{formatDateLabel(selectedDailyDate)}</span>
        <span>{dailyHistorySongs.length} 首歌曲</span>
        {#if selectedDateMeta?.weekday}<span>{selectedDateMeta.weekday}</span>{/if}
      </div>
    </div>
    {#if dailyHistorySongs.length > 0}
      <button class="daily-hero-play" onclick={onPlayAll}>播放全部</button>
    {/if}
  </section>

    {#if dailyHistoryLoading && dailyHistoryDates.length === 0}
      <div class="daily-date-scroll" aria-label="加载历史日期">
        {#each Array(7) as _}
          <div class="daily-date-chip skeleton-row">
            <span class="skeleton-line short"></span>
            <small class="skeleton-line short"></small>
          </div>
        {/each}
      </div>
    {:else if dailyHistoryDates.length > 0}
      <div class="daily-date-scroll">
        {#each dailyHistoryDates as item (item.date || item)}
          {@const date = item.date || item}
          <button class="daily-date-chip" class:active={selectedDailyDate === date} onclick={() => onSelectDate?.(date)}>
            <span>{formatDateLabel(date)}</span>
            {#if item.weekday}<small>{item.weekday}</small>{/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if dailyHistoryLoading}
      <section class="daily-song-panel" aria-label="加载歌曲">
        <div class="daily-section-header">
          <div>
            <div class="daily-section-eyebrow">Songs</div>
            <h2>{selectedDailyDate || '每日推荐'}</h2>
          </div>
        </div>
        <div class="daily-song-list">
          {#each Array(8) as _, i}
            <div class="daily-song-row skeleton-row">
              <span class="daily-song-index">{String(i + 1).padStart(2, '0')}</span>
              <span class="daily-song-cover daily-cover-placeholder skeleton-block"></span>
              <span class="daily-song-main">
                <strong class="skeleton-line"></strong>
                <em class="skeleton-line narrow"></em>
              </span>
              <span class="daily-song-album skeleton-line medium"></span>
              <span class="daily-song-dur skeleton-line short"></span>
            </div>
          {/each}
        </div>
      </section>
    {:else if dailyHistorySongs.length > 0}
      {#key selectedDailyDate}
        <section class="daily-song-panel">
          <div class="daily-section-header">
            <div>
              <div class="daily-section-eyebrow">Songs</div>
              <h2>{selectedDailyDate || '每日推荐'}</h2>
            </div>
            <button onclick={onPlayAll}>播放全部</button>
          </div>
          <div class="daily-song-list">
            {#each dailyHistorySongs as track, i (track.id)}
              <div class="daily-song-row" class:active={player.id === track.id} style={`--row-index:${Math.min(i, 12)}`} role="button" tabindex="0" onclick={() => onPlayTrack?.(track)} onkeydown={(event) => handleSongKeydown(event, track)} oncontextmenu={(e) => { e.preventDefault(); songActions?.bindRow(track)?.oncontextmenu?.(e) }}>
                <span class="daily-song-index">{String(i + 1).padStart(2, '0')}</span>
                {#if coverOf(track)}
                  <img class="daily-song-cover" src={coverUrl(coverOf(track), 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                {:else}
                  <span class="daily-song-cover daily-cover-placeholder">♫</span>
                {/if}
                <span class="daily-song-main">
                  <strong>{track.name}</strong>
                  <em>
                    {#each artistsOf(track) as artist, index (artist.id || artist.name)}
                      {#if index > 0}<span class="artist-sep">/</span>{/if}
                      {#if artist.id}
                          <button class="artist-link" onclick={(event) => { event.stopPropagation(); onOpenArtist?.(artist.id) }}>{artist.name}</button>
                      {:else}
                        <span>{artist.name}</span>
                      {/if}
                    {/each}
                  </em>
                </span>
                <span class="daily-song-album">{albumOf(track)}</span>
                <span class="daily-song-dur">{formatDuration(track.duration || track.dt || 0)}</span>
              </div>
            {/each}
          </div>
        </section>
      {/key}
    {:else}
      <div class="empty-state">
        <div class="large-icon">🗓️</div>
        <p>暂无历史日推</p>
        <p style="font-size:13px;color:var(--text-tertiary);margin-top:4px;">需要登录后获取</p>
      </div>
    {/if}
  <SongListActions onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} onBindRow={(fn) => { songActions = { bindRow: fn } }} />
</div>

<style>
  .daily-page { display: grid; gap: 20px; }
  .daily-hero { position: relative; overflow: hidden; min-height: 286px; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding: 30px; border: 1px solid color-mix(in srgb, var(--border) 72%, transparent); border-radius: 28px; background: linear-gradient(135deg, color-mix(in srgb, var(--bg-layer) 92%, transparent), color-mix(in srgb, var(--bg-surface) 88%, transparent)); box-shadow: 0 22px 60px rgba(0,0,0,0.18); }
  .daily-hero-bg { position: absolute; inset: 0; background: radial-gradient(circle at 18% 18%, color-mix(in srgb, var(--accent) 36%, transparent), transparent 34%), linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); background-size: cover; background-position: center; filter: blur(18px) saturate(1.18); transform: scale(1.08); opacity: 0.52; animation: dailyHeroIn 520ms cubic-bezier(.2,.8,.2,1) both; }
  .daily-hero-shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(0,0,0,0.62), rgba(0,0,0,0.18)), linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.56)); }
  .daily-hero-copy, .daily-hero-play { position: relative; z-index: 1; }
  .daily-kicker { color: color-mix(in srgb, var(--accent) 82%, white); font-size: 12px; font-weight: 850; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 10px; }
  .daily-hero h1 { color: white; font-size: clamp(42px, 5.2vw, 72px); line-height: 0.92; letter-spacing: 0; margin: 0; }
  .daily-hero p { max-width: 520px; margin-top: 14px; color: rgba(255,255,255,0.72); font-size: 15px; line-height: 1.7; }
  .daily-hero-stats { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
  .daily-hero-stats span { min-height: 32px; display: inline-flex; align-items: center; padding: 0 12px; border-radius: 999px; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.86); font-size: 12px; font-weight: 760; animation: dailyChipIn 360ms cubic-bezier(.2,.8,.2,1) both; }
  .daily-hero-stats span:nth-child(2) { animation-delay: 45ms; }
  .daily-hero-stats span:nth-child(3) { animation-delay: 90ms; }
  .daily-hero-play { flex-shrink: 0; height: 46px; padding: 0 22px; border: none; border-radius: 999px; background: var(--accent); color: white; font-weight: 850; cursor: pointer; box-shadow: 0 12px 28px color-mix(in srgb, var(--accent) 24%, transparent); transition: transform 0.18s, filter 0.18s, box-shadow 0.18s; }
  .daily-hero-play:hover { transform: translateY(-1px); filter: brightness(1.05); box-shadow: 0 16px 34px color-mix(in srgb, var(--accent) 28%, transparent); }
  .daily-date-scroll { display: flex; gap: 10px; overflow-x: auto; padding: 2px 0 8px; }
  .daily-date-chip { flex: 0 0 auto; min-width: 92px; display: grid; gap: 2px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 16px; background: color-mix(in srgb, var(--bg-layer) 80%, transparent); color: var(--text); text-align: left; cursor: pointer; transition: transform 0.18s, border-color 0.22s, background 0.22s, box-shadow 0.22s; }
  .daily-date-chip:hover { transform: translateY(-2px); background: var(--bg-hover); }
  .daily-date-chip span { font-size: 14px; font-weight: 850; }
  .daily-date-chip small { color: var(--text-tertiary); font-size: 11px; }
  .daily-date-chip.active { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); background: color-mix(in srgb, var(--accent) 16%, var(--bg-layer)); box-shadow: 0 10px 26px color-mix(in srgb, var(--accent) 12%, transparent); transform: translateY(-2px); }
  .daily-song-panel { border: 1px solid color-mix(in srgb, var(--border) 78%, transparent); border-radius: 24px; background: color-mix(in srgb, var(--bg-layer) 82%, transparent); padding: 16px; box-shadow: 0 14px 42px rgba(0,0,0,0.12); animation: dailyPanelIn 360ms cubic-bezier(.2,.8,.2,1) both; }
  .daily-section-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
  .daily-section-eyebrow { color: var(--accent); font-size: 11px; font-weight: 850; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 2px; }
  .daily-section-header h2 { font-size: 20px; font-weight: 850; letter-spacing: 0; margin: 0; }
  .daily-section-header button { border: none; background: transparent; color: var(--accent); font-size: 12px; font-weight: 800; cursor: pointer; }
  .daily-song-list { display: grid; gap: 5px; }
  .daily-song-row { width: 100%; min-height: 62px; display: grid; grid-template-columns: 42px 48px minmax(0, 1.2fr) minmax(120px, 0.8fr) 52px; gap: 12px; align-items: center; padding: 7px 10px; border: none; border-radius: 15px; background: transparent; color: var(--text); text-align: left; cursor: pointer; animation: dailyRowIn 320ms cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--row-index) * 28ms); transition: background 0.16s, transform 0.16s; }
  .daily-song-row:hover { background: var(--bg-hover); transform: translateX(3px); }
  .daily-song-row.active { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .daily-song-index { color: var(--text-tertiary); font-size: 13px; font-weight: 850; text-align: center; }
  .daily-song-cover { width: 48px; height: 48px; border-radius: 12px; object-fit: cover; }
  .daily-cover-placeholder { display: grid; place-items: center; background: var(--bg-surface); color: var(--text-tertiary); }
  .daily-song-main { min-width: 0; display: grid; gap: 2px; }
  .daily-song-main strong, .daily-song-album { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .daily-song-main em { min-width: 0; color: var(--text-tertiary); font-size: 12px; font-style: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .artist-link { border: none; background: transparent; color: inherit; font: inherit; cursor: pointer; }
  .artist-link:hover { color: var(--accent); }
  .artist-sep { margin: 0 4px; color: var(--text-tertiary); }
  .daily-song-album, .daily-song-dur { color: var(--text-tertiary); font-size: 12px; }
  .daily-song-dur { justify-self: end; }
  @keyframes dailyHeroIn { from { opacity: 0; transform: scale(1.14) translateY(10px); } to { opacity: 0.52; transform: scale(1.08) translateY(0); } }
  @keyframes dailyChipIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes dailyPanelIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes dailyRowIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) { .daily-hero-bg, .daily-hero-stats span, .daily-song-panel, .daily-song-row { animation: none; } .daily-hero-play, .daily-date-chip, .daily-song-row { transition: none; } }
  @media (max-width: 900px) { .daily-hero { align-items: flex-start; flex-direction: column; justify-content: flex-end; } .daily-song-row { grid-template-columns: 36px 46px minmax(0, 1fr) 48px; } .daily-song-album { display: none; } }
  @media (max-width: 560px) { .daily-hero { min-height: 240px; padding: 22px; } .daily-hero h1 { font-size: 42px; } .daily-date-chip { min-width: 78px; } }
</style>

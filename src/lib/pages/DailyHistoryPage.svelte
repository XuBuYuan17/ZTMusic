<script>
  import { player } from '../stores/player.svelte.js'
  import { formatDuration } from '../format.js'
  import Spinner from '../components/Spinner.svelte'

  let {
    dailyHistoryDates = [],
    dailyHistorySongs = [],
    dailyHistoryLoading = false,
    selectedDailyDate = '',
    onSelectDate,
    onPlayAll,
    onPlayTrack,
    onOpenArtist,
  } = $props()

  function artistsOf(track) {
    return track.artists || track.ar || []
  }
</script>

<div class="daily-page fade-in">
  <div class="page-header">
    <h1>历史日推</h1>
    <div class="subtitle">回看每天的每日推荐歌曲</div>
  </div>

  {#if dailyHistoryLoading && dailyHistoryDates.length === 0}
    <div class="loading-state" style="padding:80px 0">
      <Spinner size="lg" label="加载历史日推" />
    </div>
  {:else}
    {#if dailyHistoryDates.length > 0}
      <div class="daily-date-scroll">
        {#each dailyHistoryDates as item (item.date || item)}
          {@const date = item.date || item}
          <button class="daily-date-chip" class:active={selectedDailyDate === date} onclick={() => onSelectDate?.(date)}>
            <span>{date}</span>
            {#if item.weekday}<small>{item.weekday}</small>{/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if dailyHistoryLoading}
      <div class="loading-state" style="padding:60px 0">
        <Spinner size="md" label="加载歌曲" />
      </div>
    {:else if dailyHistorySongs.length > 0}
      <div class="recent-actions">
        <button class="play-all-btn" onclick={onPlayAll}>播放全部</button>
      </div>
      <table class="track-table">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th class="col-cover"></th>
            <th>标题</th>
            <th>歌手</th>
            <th class="col-album">专辑</th>
            <th class="col-dur">时长</th>
          </tr>
        </thead>
        <tbody>
          {#each dailyHistorySongs as track, i (track.id)}
            <tr class:active={player.id === track.id} onclick={() => onPlayTrack?.(track)}>
              <td class="col-num">{i + 1}</td>
              <td class="col-cover">
                {#if track.picUrl}
                  <img class="track-cover-img" src={track.picUrl + '?param=80y80'} alt="" loading="lazy" />
                {:else}
                  <div class="track-cover-placeholder">♫</div>
                {/if}
              </td>
              <td class="col-title">{track.name}</td>
              <td class="col-artist artist-links">
                {#each artistsOf(track) as artist, index (artist.id || artist.name)}
                  {#if index > 0}<span class="artist-sep">/</span>{/if}
                  {#if artist.id}
                    <button class="artist-link" onclick={(event) => { event.stopPropagation(); onOpenArtist?.(artist.id) }}>{artist.name}</button>
                  {:else}
                    <span>{artist.name}</span>
                  {/if}
                {/each}
              </td>
              <td class="col-album">{track.album?.name || track.al?.name || ''}</td>
              <td class="col-dur">{formatDuration(track.duration || track.dt || 0)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="empty-state">
        <div class="large-icon">🗓️</div>
        <p>暂无历史日推</p>
        <p style="font-size:13px;color:var(--text-tertiary);margin-top:4px;">需要登录后获取</p>
      </div>
    {/if}
  {/if}
</div>

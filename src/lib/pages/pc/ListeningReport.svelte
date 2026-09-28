<script lang="ts">
  import { onMount } from 'svelte'
  import { loadListeningReport } from '../../services/listening-report-store.ts'
  import { summarizeReport, listeningTime, type ReportPeriod, type ListeningRecord, type ListeningArchive } from '../../services/listening-report.ts'
  import { LISTENING_CHANGE, listeningSaveError, flushListening } from '../../services/listening-recorder.ts'
  import { coverUrl } from '../../utils/image.ts'
  import Icon from '../../components/ui/Icon.svelte'

  let period = $state<ReportPeriod>('all')
  let records = $state<ListeningRecord[]>([])
  let archive = $state<ListeningArchive>()
  let loading = $state(true)
  let error = $state('')
  let saveError = $state('')
  let now = $state(Date.now())
  let request = 0
  const report = $derived(summarizeReport(records, period, now))
  const chartMax = $derived(Math.max(1, ...report.chart.map(day => day.milliseconds)))
  const periods: { id: ReportPeriod; label: string }[] = [{ id: 'all', label: '累计' }, { id: 'week', label: '本周' }, { id: 'month', label: '本月' }]
  const covers = $derived(report.tracks.filter(row => row.track.cover).slice(0, 3))
  const periodLabel = $derived(periods.find(item => item.id === period)?.label || '累计')

  async function load() {
    const id = ++request
    saveError = listeningSaveError()
    try {
      const data = await loadListeningReport()
      if (id !== request) return
      records = data.records
      archive = data.archive
      now = Date.now()
      error = ''
    } catch { if (id === request) error = '暂时无法读取听歌记录，已有记录不会被清空。' }
    finally { if (id === request) loading = false }
  }
  onMount(() => {
    void load()
    const refresh = () => { void load() }
    window.addEventListener(LISTENING_CHANGE, refresh)
    const timer = setInterval(() => { now = Date.now() }, 60_000)
    return () => { request++; clearInterval(timer); window.removeEventListener(LISTENING_CHANGE, refresh) }
  })
</script>

<div class="listening-report">
  <header class="report-header">
    <div><span class="eyebrow">YOUR LISTENING JOURNAL</span><h1>音乐，留下了足迹。</h1><p>本地听歌统计{#if archive} · 从 {new Date(archive.startedAt).toLocaleDateString('zh-CN')} 开始记录{/if}</p></div>
    <nav aria-label="统计周期">{#each periods as item}<button class:active={period === item.id} aria-pressed={period === item.id} onclick={() => { period = item.id; now = Date.now() }}>{item.label}</button>{/each}</nav>
  </header>

  {#if saveError}<div class="report-notice" role="status">{saveError}<button onclick={() => flushListening()}>重试保存</button></div>{/if}
  {#if error}<div class="report-notice" role="alert">{error}<button onclick={load}>重新加载</button></div>{/if}
  {#if loading}<div class="report-empty" role="status">正在整理你的聆听足迹…</div>
  {:else if !error || archive}
    <section class="report-hero" aria-label="聆听概览">
      <div class="hero-copy"><span class="eyebrow">{periodLabel} · 与音乐相伴</span><h2>{listeningTime(report.milliseconds)}</h2><p>{report.trackCount ? `在 ${report.activeDays} 个日子里，与 ${report.trackCount} 首歌相遇。` : '从下一首歌开始，记录每一段真实的聆听。'}</p>
        <div class="report-numbers"><div><strong>{report.plays}</strong><span>有效播放</span></div><div><strong>{report.trackCount}</strong><span>听过歌曲</span></div><div><strong>{report.activeDays}</strong><span>活跃天数</span></div></div>
      </div>
      <div class="report-covers" aria-hidden="true">{#each covers as row, i}<img src={coverUrl(row.track.cover, 400)} alt="" referrerpolicy="no-referrer" style={`--i:${i}`} />{/each}{#if !covers.length}<div class="cover-placeholder"><Icon name="music" size={70} strokeWidth={1} /><span>下一首，新的足迹</span></div>{/if}</div>
    </section>

    <section class="report-rhythm"><div class="section-heading"><div><span class="eyebrow">DAILY RHYTHM</span><h2>聆听的日常</h2></div><span>{period === 'all' ? '最近 30 天' : periodLabel} · 实际聆听时长</span></div>
      <div class="report-chart" role="group" aria-label="每日聆听时长">{#each report.chart as day}<button type="button" class="chart-day" aria-label={`${day.day}：${listeningTime(day.milliseconds)}`}><span class="chart-track"><span style={`height:${day.milliseconds ? Math.max(2, day.milliseconds / chartMax * 100) : 0}%`}></span></span><small>{day.day.slice(8)}</small><span class="chart-tooltip">{day.day}<br />{listeningTime(day.milliseconds)}</span></button>{/each}</div>
    </section>

    <div class="report-rankings">
      <section><div class="section-heading"><div><span class="eyebrow">ON REPEAT</span><h2>反复相遇的歌</h2></div><span>TOP 10</span></div>
        {#if !report.tracks.length}<p class="ranking-empty">这个周期还没有聆听记录。</p>{:else}<ol class="track-ranking">{#each report.tracks as row, i}<li><span class="rank-number">{String(i + 1).padStart(2, '0')}</span>{#if row.track.cover}<img src={coverUrl(row.track.cover, 120)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="rank-placeholder"><Icon name="music" size={22} /></span>{/if}<div class="rank-copy"><strong title={row.track.name}>{row.track.name}</strong><small>{row.track.artists.join(' / ') || '未知歌手'}</small></div><div class="rank-time"><span>{listeningTime(row.milliseconds)}</span><small>{row.plays} 次有效播放</small></div></li>{/each}</ol>{/if}
      </section>
      <section><div class="section-heading"><div><span class="eyebrow">FAMILIAR VOICES</span><h2>熟悉的声音</h2></div><span>TOP 5</span></div>
        {#if !report.artists.length}<p class="ranking-empty">听过的声音，会慢慢汇集在这里。</p>{:else}<ol class="artist-ranking">{#each report.artists as artist, i}<li><span class="artist-initial" aria-hidden="true">{artist.name.slice(0, 1)}</span><div><strong>{artist.name}</strong><small>{listeningTime(artist.milliseconds)} · {artist.plays} 次有效播放</small><span class="artist-meter"><i style={`width:${artist.milliseconds / (report.artists[0]?.milliseconds || 1) * 100}%`}></i></span></div><span class="rank-number">{i + 1}</span></li>{/each}</ol>{/if}
      </section>
    </div>
    {#if period === 'all' && archive && archive.legacy.playCount > 0}<aside class="legacy-report"><div><span class="eyebrow">早些时候</span><h2>历史估算</h2><p>旧版保留的最近 200 首历史快照，按歌曲长度估算；未并入上方真实统计。</p></div><div><strong>{archive.legacy.playCount} 次</strong><span>旧版播放记录</span></div><div><strong>{listeningTime(archive.legacy.totalDuration)}</strong><span>估算时长</span></div></aside>{/if}
    <footer><p>听满 30 秒计一次有效播放；不足 60 秒的歌曲，听满一半计次。短暂聆听仍累计时长。</p><p>记录仅保存在本机。清空最近播放不会删除本报告；合作歌曲会计入每位歌手的排行。</p></footer>
  {/if}
</div>

<style>
  .listening-report { max-width: 1360px; margin: 0 auto; padding: clamp(24px, 3.5vw, 56px); color: var(--text); }
  .report-header { display: flex; justify-content: space-between; align-items: center; gap: 24px; margin-bottom: 30px; }
  .eyebrow { font-size: 10px; font-weight: 700; letter-spacing: .16em; color: var(--accent); }
  h1 { font-size: clamp(26px, 2.5vw, 38px); letter-spacing: -.04em; margin: 10px 0; }
  p { color: var(--text-tertiary); font-size: 12px; line-height: 1.8; }
  nav { display: flex; flex-shrink: 0; padding: 4px; border: 1px solid var(--border); border-radius: 999px; background: var(--bg-layer); }
  button { font: inherit; cursor: pointer; }
  nav button { border: 0; background: transparent; color: var(--text-secondary); padding: 8px 18px; font-size: 12px; border-radius: 999px; }
  nav button.active { background: var(--bg-elevated); color: var(--text); box-shadow: 0 2px 8px #0000000c; }
  button:focus-visible, .chart-day:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .report-hero { position: relative; display: grid; grid-template-columns: 1.25fr 1fr; min-height: 290px; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-xl); background: radial-gradient(ellipse at 90% 30%, color-mix(in srgb, var(--accent) 13%, transparent), transparent 65%), var(--bg-surface); padding: 36px; gap: 20px; }
  .hero-copy { z-index: 1; min-width: 0; }
  .hero-copy h2 { font-size: clamp(30px, 3.8vw, 58px); line-height: 1.2; letter-spacing: -.045em; font-weight: 700; margin: 20px 0 12px; }
  .report-numbers { display: flex; gap: clamp(25px, 4vw, 70px); margin-top: 30px; }
  .report-numbers strong { display: block; font-size: 23px; font-variant-numeric: tabular-nums; font-weight: 500; }
  .report-numbers span { display: block; color: var(--text-tertiary); font-size: 11px; margin-top: 6px; }
  .report-covers { position: relative; min-width: 0; min-height: 210px; align-self: center; }
  .report-covers img { position: absolute; width: min(62%, 210px); aspect-ratio: 1; object-fit: cover; border-radius: var(--radius-md); left: calc(4% + var(--i) * 17%); top: calc(10px + var(--i) * 4px); transform: rotate(calc(-8deg + var(--i) * 8deg)); box-shadow: 0 15px 35px #0003; border: 3px solid var(--bg-elevated); }
  .cover-placeholder { height: 210px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; color: color-mix(in srgb, var(--accent) 40%, var(--text-tertiary)); }
  .cover-placeholder span { font-size: 12px; letter-spacing: .1em; }
  .report-rhythm { margin: 32px 0; padding: 24px 26px 18px; border: 1px solid var(--border); border-radius: var(--radius-lg); }
  .section-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 20px; }
  .section-heading h2 { margin: 7px 0 0; font-size: 19px; font-weight: 500; }
  .section-heading > span { color: var(--text-tertiary); font-size: 10px; flex-shrink: 0; }
  .report-chart { display: flex; gap: 6px; height: 112px; }
  .chart-day { border: 0; padding: 0; background: transparent; color: inherit; position: relative; flex: 1; min-width: 0; text-align: center; border-radius: 4px; }
  .chart-track { height: 90px; display: flex; align-items: end; border-bottom: 1px solid var(--border); }
  .chart-track > span { width: 100%; max-width: 40px; margin: 0 auto; border-radius: 4px 4px 0 0; background: color-mix(in srgb, var(--accent) 65%, var(--bg-layer)); }
  .chart-day small { font-size: 9px; color: var(--text-tertiary); }
  .chart-tooltip { display: none; position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); white-space: nowrap; padding: 8px 10px; border: 1px solid var(--border); background: var(--bg-elevated); border-radius: var(--radius-sm); z-index: 2; font-size: 11px; line-height: 1.6; }
  .chart-day:first-child .chart-tooltip { left: 0; transform: none; }
  .chart-day:last-child .chart-tooltip { left: auto; right: 0; transform: none; }
  .chart-day:hover .chart-tooltip, .chart-day:focus-visible .chart-tooltip { display: block; }
  .report-rankings { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 36px; }
  .report-rankings > section { min-width: 0; }
  ol { padding: 0; margin: 0; list-style: none; }
  .track-ranking li { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .rank-number { font-size: 11px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; width: 19px; flex-shrink: 0; }
  .track-ranking img, .rank-placeholder { width: 44px; height: 44px; border-radius: var(--radius-xs); object-fit: cover; flex-shrink: 0; }
  .rank-placeholder { display: grid; place-items: center; background: var(--bg-layer); color: var(--text-tertiary); }
  .rank-copy { flex: 1; min-width: 0; }
  .rank-copy strong { display: -webkit-box; line-clamp: 2; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 12px; line-height: 1.5; font-weight: 500; }
  small { display: block; font-size: 10px; color: var(--text-tertiary); margin-top: 4px; }
  .rank-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rank-time { max-width: 100px; font-size: 11px; text-align: right; color: var(--text-secondary); flex-shrink: 0; }
  .artist-ranking li { display: flex; gap: 12px; align-items: center; padding: 13px 0; }
  .artist-initial { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 10%, var(--bg-layer)); color: var(--accent); flex-shrink: 0; }
  .artist-ranking li > div { flex: 1; min-width: 0; }
  .artist-ranking strong { display: -webkit-box; line-clamp: 2; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 12px; }
  .artist-meter { display: block; height: 3px; background: var(--bg-layer); border-radius: 3px; margin-top: 10px; overflow: hidden; }
  .artist-meter i { display: block; height: 100%; background: color-mix(in srgb, var(--accent) 55%, var(--bg-layer)); }
  .legacy-report { display: flex; align-items: center; gap: 28px; margin-top: 36px; padding: 24px; border-radius: var(--radius-lg); background: var(--bg-layer); }
  .legacy-report > div:first-child { flex: 1; }
  .legacy-report h2 { font-size: 16px; margin: 8px 0; }
  .legacy-report strong { font-size: 16px; font-weight: 500; }
  .legacy-report > div > span:not(.eyebrow) { display: block; font-size: 10px; color: var(--text-tertiary); margin-top: 6px; }
  footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--border); }
  footer p { font-size: 10px; margin: 4px 0; }
  .ranking-empty, .report-empty { padding: 35px 0; color: var(--text-tertiary); }
  .report-notice { display: flex; gap: 16px; align-items: center; margin: 16px 0; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 12px; }
  .report-notice button { flex-shrink: 0; border: 0; background: var(--bg-layer); padding: 8px 12px; border-radius: var(--radius-xs); color: var(--text); }
  @media (max-width: 1100px) { .report-hero { padding: 26px; } .report-rankings { gap: 24px; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); } .legacy-report { flex-wrap: wrap; } .legacy-report > div:first-child { flex-basis: 100%; } }
</style>

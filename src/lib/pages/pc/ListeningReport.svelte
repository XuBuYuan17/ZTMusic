<script lang="ts">
  import { onMount } from 'svelte'
  import { loadListeningReport } from '../../services/listening-report-store.ts'
  import { summarizeReport, listeningTime, LISTENING_RETENTION_DAYS, type ReportPeriod, type ListeningRecord, type ListeningArchive } from '../../services/listening-report.ts'
  import { LISTENING_CHANGE, listeningSaveError, flushListening } from '../../services/listening-recorder.ts'
  import { coverUrl } from '../../utils/image.ts'
  import Icon from '../../components/ui/Icon.svelte'

  type WallCell = { key: string; label: string; caption: string; value: number; level: number }
  let period = $state<ReportPeriod>('all')
  let records = $state<ListeningRecord[]>([])
  let archive = $state<ListeningArchive>()
  let loading = $state(true)
  let error = $state('')
  let saveError = $state('')
  let now = $state(Date.now())
  let request = 0
  const report = $derived(summarizeReport(records, period, now))
  const periods: { id: ReportPeriod; label: string }[] = [{ id: 'all', label: '累计' }, { id: 'week', label: '本周' }, { id: 'month', label: '本月' }]
  const covers = $derived(report.tracks.filter(row => row.track.cover).slice(0, 3))
  const periodLabel = $derived(periods.find(item => item.id === period)?.label || '累计')
  // 热力图 0 级是「没听」，1–5 级按该图最大值五等分；任何非零值至少 1 级
  const levelOf = (value: number, max: number) => value > 0 ? Math.min(5, Math.ceil(value / max * 5)) : 0
  const hourMax = $derived(Math.max(1, ...report.hours))
  const weekdayMax = $derived(Math.max(1, ...report.weekdays))
  const yearDays = $derived(report.chart.filter(day => day.day.startsWith(`${new Date(now).getFullYear()}-`)))
  const dayMax = $derived(Math.max(1, ...yearDays.map(day => day.milliseconds)))
  const dayCells = $derived<WallCell[]>(yearDays.map(day => ({ key: day.day, label: day.day.slice(8), caption: day.day, value: day.milliseconds, level: levelOf(day.milliseconds, dayMax) })))
  // 列是一周，所以首列前面要补上这段区间开始时还没到的几天，格子才对得上星期
  const dayLead = $derived(dayCells.length ? (new Date(`${dayCells[0]!.key}T12:00:00`).getDay() + 6) % 7 : 0)
  const dayCols = $derived(Math.ceil((dayCells.length + dayLead) / 7))
  const daySlots = $derived<(WallCell | null)[]>([...new Array<null>(dayLead).fill(null), ...dayCells])
  // 一周可能横跨两个月，取这周第一天所在的月份，和 GitHub 一个算法
  const monthMarks = $derived.by(() => {
    const marks: { key: string; label: string; start: number; span: number }[] = []
    for (let col = 0; col < dayCols; col++) {
      const cell = daySlots.slice(col * 7, col * 7 + 7).find(Boolean)
      if (!cell) continue
      const month = cell.key.slice(0, 7)
      const last = marks.at(-1)
      if (last?.key === month) last.span++
      else marks.push({ key: month, label: `${Number(month.slice(5))} 月`, start: col, span: 1 })
    }
    return marks
  })
  const hourCells = $derived<WallCell[]>(report.hours.map((value, hour) => ({ key: String(hour), label: String(hour), caption: `${String(hour).padStart(2, '0')}:00`, value, level: levelOf(value, hourMax) })))
  const weekdayNames = ['一', '二', '三', '四', '五', '六', '日']
  const weekdayCells = $derived<WallCell[]>(report.weekdays.map((value, index) => ({ key: weekdayNames[index]!, label: weekdayNames[index]!, caption: `周${weekdayNames[index]}`, value, level: levelOf(value, weekdayMax) })))
  const wallLabel = $derived(`${periodLabel}聆听分布，${dayCells[0]?.key || '—'} 至 ${dayCells.at(-1)?.key || '—'}，${dayCells.filter(day => day.value > 0).length} 天有聆听记录`)

  function revealLatestDays(node: HTMLElement) {
    const observer = new ResizeObserver(() => {
      if (document.documentElement.classList.contains('mobile-runtime')) node.scrollLeft = node.scrollWidth
    })
    observer.observe(node)
    const grid = node.querySelector('.wall-grid-heat')
    if (grid) observer.observe(grid)
    return { destroy: () => observer.disconnect() }
  }

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
  <!-- ponytail: 365 个格子逐个做 tab 停靠点会毁掉键盘导航，所以整块图当成一张 role="img" 用汇总标签念，
       逐格详情只在 title 里。要逐格键盘可达就得改成 roving tabindex。 -->
  {#snippet heat(slots: (WallCell | null)[], cols: number, label: string)}
    <div class="wall-figure wall-figure-heat" class:wall-figure-compact={cols <= 12} style={`--wall-cell-size:${cols <= 12 ? 28 : 12}px`} role="img" aria-label={label}>
      <div class="wall-weekdays">{#each ['一', '', '三', '', '五', '', '日'] as text}<span>{text}</span>{/each}</div>
      <div class="wall-scroll" use:revealLatestDays>
        <div class="wall-months" style={`grid-template-columns:repeat(${cols},var(--wall-cell-size))`}>
          {#each monthMarks as mark, i (mark.key)}{#if i > 0 || mark.span > 1 || monthMarks.length === 1}<span style={`grid-column:${mark.start + 1}/span ${mark.span}`}>{mark.label}</span>{/if}{/each}
        </div>
        <div class="wall-grid wall-grid-heat">
          {#each slots as cell, i (cell?.key ?? `blank${i}`)}
            <span class="wall-cell" class:wall-cell-blank={!cell} style={`--fill:${(cell?.level ?? 0) * 18}%`} title={cell ? `${cell.caption}：${listeningTime(cell.value)}` : undefined}></span>
          {/each}
        </div>
      </div>
    </div>
    <div class="wall-legend" aria-hidden="true"><span class="wall-scroll-hint">左右滑动查看更多</span><span>少</span>{#each [0, 18, 36, 54, 72, 90] as fill}<i class="wall-cell" style={`--fill:${fill}%`}></i>{/each}<span>多</span></div>
  {/snippet}

  {#snippet week(cells: WallCell[], label: string)}
    <div class="wall-figure wall-week-figure" role="img" aria-label={label}>
      <div class="wall-week-strip">
        {#each weekdayNames as weekday, i}
          {@const cell = cells.find(day => (new Date(`${day.key}T12:00:00`).getDay() + 6) % 7 === i)}
          <div class="wall-week-day">
            <span class="wall-cell" class:wall-cell-future={!cell} style={`--fill:${(cell?.level ?? 0) * 18}%`} title={cell ? `${cell.caption}：${listeningTime(cell.value)}` : undefined}>{cell?.label ?? ''}</span>
            <span class="wall-week-label">{weekday}</span>
          </div>
        {/each}
      </div>
    </div>
  {/snippet}

  <!-- 单行版：一格一小时 / 一格一天，刻度用 step 抽稀，否则 24 个数字糊成一片 -->
  {#snippet strip(cells: WallCell[], step: number, label: string)}
    <div class="wall-figure wall-figure-strip" role="img" aria-label={label}>
      <div class="wall-grid wall-grid-strip">
        {#each cells as cell (cell.key)}
          <span class="wall-cell" style={`--fill:${cell.level * 18}%`} title={`${cell.caption}：${listeningTime(cell.value)}`}></span>
        {/each}
      </div>
      <div class="wall-axis" style={`grid-template-columns:repeat(${cells.length},minmax(0,1fr))`}>
        {#each cells as cell, i (cell.key)}<span>{i % step ? '' : cell.label}</span>{/each}
      </div>
    </div>
  {/snippet}

  <header class="report-header">
    <div><h1>听歌报告</h1><p>本地听歌统计{#if archive} · 从 {new Date(archive.startedAt).toLocaleDateString('zh-CN')} 开始记录{/if}</p></div>
    <nav aria-label="统计周期">{#each periods as item}<button class:active={period === item.id} aria-pressed={period === item.id} onclick={() => { period = item.id; now = Date.now() }}>{item.label}</button>{/each}</nav>
  </header>

  {#if saveError}<div class="report-notice" role="status">{saveError}<button onclick={() => flushListening()}>重试保存</button></div>{/if}
  {#if error}<div class="report-notice" role="alert">{error}<button onclick={load}>重新加载</button></div>{/if}
  {#if loading}<div class="report-empty" role="status">正在整理你的聆听足迹…</div>
  {:else if !error || archive}
    <section class="report-hero" aria-label="聆听概览">
      <div class="hero-copy"><span class="eyebrow">{periodLabel}聆听时长</span><h2>{listeningTime(report.milliseconds)}</h2><p>{report.trackCount ? `在 ${report.activeDays} 个日子里，与 ${report.trackCount} 首歌相遇。` : '从下一首歌开始，记录每一段真实的聆听。'}</p>
        <div class="report-numbers"><div><strong>{report.plays}</strong><span>有效播放</span></div><div><strong>{report.trackCount}</strong><span>听过歌曲</span></div><div><strong>{report.activeDays}</strong><span>活跃天数</span></div></div>
      </div>
      <div class="report-covers" aria-hidden="true">{#each covers as row, i}<img src={coverUrl(row.track.cover, 400)} alt="" referrerpolicy="no-referrer" style={`--i:${i}`} />{/each}{#if !covers.length}<div class="cover-placeholder"><Icon name="music" size={70} strokeWidth={1} /><span>下一首，新的足迹</span></div>{/if}</div>
    </section>

    <section class="report-rhythm"><div class="section-heading"><div><h2>聆听的日常</h2></div><span>{period === 'all' ? `${new Date(now).getFullYear()} 年` : periodLabel} · 一格一天</span></div>
      {#if period === 'week'}{@render week(dayCells, wallLabel)}{:else}{@render heat(daySlots, dayCols, wallLabel)}{/if}
    </section>

    <div class="report-clocks">
      <section class="report-rhythm"><div class="section-heading"><div><h2>聆听的时钟</h2></div><span>{periodLabel} · 一格一小时</span></div>
        {@render strip(hourCells, 3, `每小时聆听时长，${periodLabel}`)}
      </section>
      <section class="report-rhythm"><div class="section-heading"><div><h2>一周的分布</h2></div><span>{periodLabel} · 一格一天</span></div>
        {@render strip(weekdayCells, 1, `每星期聆听时长，${periodLabel}`)}
      </section>
    </div>

    <div class="report-rankings report-facts">
      <section><div class="section-heading"><div><h2>习惯</h2></div><span>{periodLabel}</span></div>
        {#if report.activeDays}<dl class="fact-list">
          <div><dt>当前连续<small>最长 {report.streak.longest} 天</small></dt><dd>{report.streak.current} 天</dd></div>
          <div><dt>日均聆听<small>按有聆听的日子算</small></dt><dd>{listeningTime(report.averagePerDay)}</dd></div>
          <div><dt>最投入的一天<small>{report.bestDay?.day || '—'}</small></dt><dd>{report.bestDay ? listeningTime(report.bestDay.milliseconds) : '—'}</dd></div>
          <div><dt>单曲循环最多<small>{report.topTrack ? `${report.topTrack.plays} 次有效播放` : '—'}</small></dt><dd title={report.topTrack?.track.name || ''}>{report.topTrack?.track.name || '—'}</dd></div>
        </dl>{:else}<p class="ranking-empty">听上几天，这里会出现你的习惯。</p>{/if}
      </section>
      <section><div class="section-heading"><div><h2>发现</h2></div><span>{periodLabel}</span></div>
        {#if report.activeDays}<dl class="fact-list">
          <div><dt>新遇见的歌<small>第一次听</small></dt><dd>{report.discovered.tracks} 首</dd></div>
          <div><dt>新遇见的歌手<small>第一次听</small></dt><dd>{report.discovered.artists} 位</dd></div>
          <div><dt>听过的歌手<small>不重复</small></dt><dd>{report.diversity.artists} 位</dd></div>
          <div><dt>重复度<small>平均每首歌</small></dt><dd>{report.trackCount ? (report.plays / report.trackCount).toFixed(1) : '0'} 次</dd></div>
        </dl>{:else}<p class="ranking-empty">还没有可以发现的足迹。</p>{/if}
      </section>
    </div>

    <div class="report-rankings">
      <section><div class="section-heading"><div><h2>反复相遇的歌</h2></div><span>TOP 10</span></div>
        {#if !report.tracks.length}<p class="ranking-empty">这个周期还没有聆听记录。</p>{:else}<ol class="track-ranking">{#each report.tracks as row, i}<li><span class="rank-number">{String(i + 1).padStart(2, '0')}</span>{#if row.track.cover}<img src={coverUrl(row.track.cover, 120)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="rank-placeholder"><Icon name="music" size={22} /></span>{/if}<div class="rank-copy"><strong title={row.track.name}>{row.track.name}</strong><small>{row.track.artists.join(' / ') || '未知歌手'}</small></div><div class="rank-time"><span>{listeningTime(row.milliseconds)}</span><small>{row.plays} 次有效播放</small></div></li>{/each}</ol>{/if}
      </section>
      <section><div class="section-heading"><div><h2>熟悉的声音</h2></div><span>TOP 5</span></div>
        {#if !report.artists.length}<p class="ranking-empty">听过的声音，会慢慢汇集在这里。</p>{:else}<ol class="artist-ranking">{#each report.artists as artist, i}<li><span class="artist-initial" aria-hidden="true">{artist.name.slice(0, 1)}</span><div><strong>{artist.name}</strong><small>{listeningTime(artist.milliseconds)} · {artist.plays} 次有效播放</small><span class="artist-meter"><i style={`width:${artist.milliseconds / (report.artists[0]?.milliseconds || 1) * 100}%`}></i></span></div><span class="rank-number">{i + 1}</span></li>{/each}</ol>{/if}
      </section>
    </div>
    {#if period === 'all' && archive && archive.legacy.playCount > 0}<aside class="legacy-report"><div><span class="eyebrow">早些时候</span><h2>历史估算</h2><p>旧版保留的最近 200 首历史快照，按歌曲长度估算；未并入上方真实统计。</p></div><div><strong>{archive.legacy.playCount} 次</strong><span>旧版播放记录</span></div><div><strong>{listeningTime(archive.legacy.totalDuration)}</strong><span>估算时长</span></div></aside>{/if}
    <footer><p>听满 30 秒计一次有效播放；不足 60 秒的歌曲，听满一半计次。短暂聆听仍累计时长。</p><p>记录仅保存在本机。清空最近播放不会删除本报告；合作歌曲会计入每位歌手的排行。</p><p>超过 {LISTENING_RETENTION_DAYS} 天的逐次播放记录会按天合并保存，时长与次数不变；时段分布只统计启用之后的数据。</p></footer>
  {/if}
</div>

<style>
  .listening-report { max-width: 1180px; margin: 0 auto; color: var(--text); }
  .report-header { display: flex; justify-content: space-between; align-items: end; gap: 24px; padding: 0 0 20px; }
  .eyebrow { font-size: 10px; font-weight: 700; letter-spacing: .1em; color: var(--accent); }
  h1 { font-size: clamp(24px, 2.5vw, 32px); margin: 0 0 8px; }
  p { color: var(--text-tertiary); font-size: 12px; line-height: 1.8; }
  nav { display: flex; flex-shrink: 0; padding: 4px; border: 1px solid var(--border); border-radius: 999px; background: var(--bg-surface); }
  button { font: inherit; cursor: pointer; }
  nav button { border: 0; border-radius: 999px; background: transparent; color: var(--text-secondary); padding: 8px 15px; font-size: 12px; }
  nav button.active { background: var(--accent-bg); color: var(--accent); font-weight: 700; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .report-hero { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .8fr); align-items: center; gap: 28px; padding: 28px; border: 1px solid var(--border); border-radius: var(--radius-xl); background: var(--bg-surface); }
  .hero-copy { z-index: 1; min-width: 0; }
  .hero-copy h2 { font-size: clamp(30px, 3.8vw, 48px); line-height: 1.2; font-weight: 700; margin: 10px 0 8px; }
  .report-numbers { display: flex; gap: clamp(25px, 4vw, 70px); margin-top: 24px; }
  .report-numbers strong { display: block; font-size: 23px; font-variant-numeric: tabular-nums; font-weight: 500; }
  .report-numbers span { display: block; color: var(--text-tertiary); font-size: 11px; margin-top: 6px; }
  .report-covers { min-width: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: center; gap: 8px; align-self: center; }
  .report-covers img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--radius-sm); }
  .cover-placeholder { grid-column: 1 / -1; height: 150px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; color: color-mix(in srgb, var(--accent) 40%, var(--text-tertiary)); }
  .cover-placeholder span { font-size: 12px; letter-spacing: .1em; }
  .report-rhythm { margin: 20px 0; padding: 22px; border: 1px solid var(--border); border-radius: var(--radius-xl); background: var(--bg-surface); }
  .section-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 20px; }
  .section-heading h2 { margin: 0; font-size: 18px; font-weight: 700; }
  .section-heading > span { color: var(--text-tertiary); font-size: 10px; flex-shrink: 0; }
  /* 热力图：颜色深浅代替柱高。0 级格子的底色必须比卡片背景深一档 ——
     --bg-layer(#eee) 和页面 --bg(#e8e8ed) 只差 6 个色阶，直接拿它当空格子会看不见，整块糊成散点 */
  .wall-figure { --wall-empty: color-mix(in srgb, var(--text) 9%, var(--bg-layer)); --wall-cell-size: 12px; display: grid; max-width: 100%; gap: 4px 8px; }
  .wall-figure-heat { grid-template-columns: 20px minmax(0, 1fr); align-items: start; }
  .wall-figure-compact { grid-template-columns: 20px max-content; justify-content: center; }
  .wall-scroll { min-width: 0; max-width: 100%; display: grid; grid-template-columns: max-content; gap: 4px; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: thin; padding-bottom: 6px; }
  .wall-months { display: grid; width: max-content; height: 18px; gap: 3px; font-size: 10px; line-height: 18px; color: var(--text-tertiary); }
  .wall-months span { overflow: visible; white-space: nowrap; }
  .wall-weekdays { display: grid; grid-template-rows: repeat(7, var(--wall-cell-size)); align-items: center; gap: 3px; margin-top: 22px; font-size: 10px; line-height: 1; color: var(--text-tertiary); text-align: right; }
  .wall-grid { display: grid; grid-auto-flow: column; gap: 3px; }
  .wall-grid-heat { width: max-content; grid-template-rows: repeat(7, var(--wall-cell-size)); grid-auto-columns: var(--wall-cell-size); }
  .wall-grid-strip { grid-template-rows: 26px; grid-auto-columns: minmax(0, 1fr); }
  .wall-figure-strip { grid-template-columns: minmax(0, 1fr); }
  .wall-figure-strip .wall-grid { grid-area: 1 / 1; }
  .wall-axis { grid-area: 2 / 1; display: grid; gap: 3px; font-size: 10px; line-height: 1; color: var(--text-tertiary); }
  .wall-cell { border-radius: 2px; background: color-mix(in srgb, var(--accent) var(--fill), var(--wall-empty)); }
  .wall-cell-blank { visibility: hidden; }
  .wall-week-figure { display: block; }
  .wall-week-strip { width: min(100%, 420px); display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; margin: 0 auto; }
  .wall-week-day { min-width: 0; display: grid; gap: 6px; text-align: center; }
  .wall-week-day .wall-cell { aspect-ratio: 1; display: grid; place-items: center; font-size: 12px; font-variant-numeric: tabular-nums; }
  .wall-week-day .wall-cell-future { border: 1px dashed color-mix(in srgb, var(--text) 22%, transparent); background: color-mix(in srgb, var(--text) 3%, transparent); }
  .wall-week-label { color: var(--text-tertiary); font-size: 11px; line-height: 1; }
  .wall-legend { --wall-empty: color-mix(in srgb, var(--text) 9%, var(--bg-layer)); display: flex; align-items: center; justify-content: end; gap: 4px; margin-top: 6px; color: var(--text-tertiary); font-size: 10px; }
  .wall-legend i { width: 10px; height: 10px; flex: none; }
  .wall-scroll-hint { display: none; margin-right: auto; }
  .wall-figure-compact + .wall-legend .wall-scroll-hint { display: none; }
  .report-clocks { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 16px; margin: 20px 0; }
  .report-clocks > .report-rhythm { margin: 0; min-width: 0; }
  .report-facts { margin: 20px 0; }
  .fact-list { margin: 0; padding: 0; }
  .fact-list > div { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .fact-list > div:last-child { border-bottom: 0; padding-bottom: 0; }
  .fact-list dt { color: var(--text-tertiary); font-size: 11px; flex-shrink: 0; }
  .fact-list dd { margin: 0; min-width: 0; font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .report-rankings { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 20px; padding: 22px; border: 1px solid var(--border); border-radius: var(--radius-xl); background: var(--bg-surface); }
  .report-rankings > section { min-width: 0; }
  .report-rankings > section + section { padding-left: 24px; border-left: 1px solid var(--border); }
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
  .legacy-report { display: flex; align-items: center; gap: 28px; margin-top: 24px; padding: 20px 0; border-top: 3px double var(--text-secondary); border-bottom: 1px solid var(--border); }
  .legacy-report > div:first-child { flex: 1; }
  .legacy-report h2 { font-size: 16px; margin: 8px 0; }
  .legacy-report strong { font-size: 16px; font-weight: 500; }
  .legacy-report > div > span:not(.eyebrow) { display: block; font-size: 10px; color: var(--text-tertiary); margin-top: 6px; }
  footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--border); }
  footer p { font-size: 10px; margin: 4px 0; }
  .ranking-empty, .report-empty { padding: 35px 0; color: var(--text-tertiary); }
  .report-notice { display: flex; gap: 16px; align-items: center; margin: 16px 0; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 12px; }
  .report-notice button { flex-shrink: 0; border: 0; background: var(--bg-layer); padding: 8px 12px; border-radius: var(--radius-xs); color: var(--text); }
  @media (max-width: 1100px) { .report-hero { padding: 24px; } .report-rankings { gap: 24px; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); } .legacy-report { flex-wrap: wrap; } .legacy-report > div:first-child { flex-basis: 100%; } }
</style>

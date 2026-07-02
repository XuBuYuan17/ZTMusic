<script>
  let { name = '', size = 22, strokeWidth = 2, class: className = '', fill = 'currentColor', ...rest } = $props()

  const ICONS = {
    // navigation
    home: 'M12.7 1.1a1 1 0 0 0-1.4 0l-10 8.8A1 1 0 0 0 2 11.6h1v10a1 1 0 0 0 1 1h7v-7h2v7h7a1 1 0 0 0 1-1v-10h1a1 1 0 0 0 .7-1.7z',
    explore: [{type:'circle',cx:12,cy:12,r:10},{type:'polygon',points:'16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88',fill:'currentColor',opacity:.2},{type:'polygon',points:'16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88'}],
    grid: 'M4 4h7v7H4zm9 0h7v7h-7zm-9 9h7v7H4zm9 0h7v7h-7z',
    compass: [{type:'circle',cx:12,cy:12,r:10},{type:'polygon',points:'16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88',fill:'currentColor',opacity:.2},{type:'polygon',points:'16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88'}],
    // sidebar
    calendar: 'M3 4h18v18H3zm13-2v4M8 2v4M3 10h18',
    liked: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
    clock: [{type:'circle',cx:12,cy:12,r:10},{type:'polyline',points:'12 6 12 12 16 14'}],
    daily: 'M3 4h18v18H3zm13-2v4M8 2v4M3 10h18',
    messages: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
    sun: [{type:'circle',cx:12,cy:12,r:5},{type:'line',x1:12,y1:1,x2:12,y2:3},{type:'line',x1:12,y1:21,x2:12,y2:23},{type:'line',x1:4.22,y1:4.22,x2:5.64,y2:5.64},{type:'line',x1:18.36,y1:18.36,x2:19.78,y2:19.78},{type:'line',x1:1,y1:12,x2:3,y2:12},{type:'line',x1:21,y1:12,x2:23,y2:12},{type:'line',x1:4.22,y1:19.78,x2:5.64,y2:18.36},{type:'line',x1:18.36,y1:5.64,x2:19.78,y2:4.22}],
    settings: [{type:'circle',cx:12,cy:12,r:3},{type:'path',d:'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z'}],
    logout: [{type:'path',d:'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4'},{type:'polyline',points:'16 17 21 12 16 7'},{type:'line',x1:21,y1:12,x2:9,y2:12}],
    about: [{type:'circle',cx:12,cy:12,r:10},{type:'line',x1:12,y1:10,x2:12,y2:16},{type:'circle',cx:12,cy:7,r:1}],
    info: [{type:'circle',cx:12,cy:12,r:10},{type:'line',x1:12,y1:10,x2:12,y2:16},{type:'circle',cx:12,cy:7,r:1}],
    // player controls
    shuffle: [{type:'path',d:'M21 2l4 4-4 4M3 18h4.5c3.16 0 5.73-2.58 5.88-5.73L13.5 6',fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round',strokeLinejoin:'round'},{type:'path',d:'M21 10l4-4-4-4',fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round',strokeLinejoin:'round'},{type:'path',d:'M3 6h4.5c3.16 0 5.73 2.58 5.88 5.73L13.5 12',fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round',strokeLinejoin:'round'},{type:'path',d:'M21 14v4a2 2 0 0 1-2 2H5',fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round',strokeLinejoin:'round'}],
    // shuffle-lg: fa7-solid--random (public/fa7-solid--random.svg)
    'shuffle-lg': {v:'0 0 640 640', d:'M467.8 98.4c12-5 25.7-2.2 34.9 6.9l64 64c6 6 9.4 14.1 9.4 22.6s-3.4 16.6-9.4 22.6l-64 64c-9.2 9.2-22.9 11.9-34.9 6.9S448 268.9 448 256v-32h-32c-10.1 0-19.6 4.7-25.6 12.8L358 280l-40-53.3l21.2-28.3c18.1-24.2 46.6-38.4 76.8-38.4h32v-32c0-12.9 7.8-24.6 19.8-29.6M218 360l40 53.3l-21.2 28.3C218.7 465.8 190.2 480 160 480H96c-17.7 0-32-14.3-32-32s14.3-32 32-32h64c10.1 0 19.6-4.7 25.6-12.8zm284.6 174.6c-9.2 9.2-22.9 11.9-34.9 6.9S448 524.9 448 512v-32h-32c-30.2 0-58.7-14.2-76.8-38.4L185.6 236.8c-6-8.1-15.5-12.8-25.6-12.8H96c-17.7 0-32-14.3-32-32s14.3-32 32-32h64c30.2 0 58.7 14.2 76.8 38.4l153.6 204.8c6 8.1 15.5 12.8 25.6 12.8h32v-32c0-12.9 7.8-24.6 19.8-29.6s25.7-2.2 34.9 6.9l64 64c6 6 9.4 14.1 9.4 22.6s-3.4 16.6-9.4 22.6l-64 64z'},
    // prev: iconamoon--player-previous-fill (public/iconamoon--player-previous-fill.svg)
    prev: {v:'0 0 24 24', d:'M2.5 9.402c-2 1.155-2 4.041 0 5.196l9 5.196c1.515.875 3.317.259 4.102-1.096l1.898 1.096c2 1.155 4.5-.288 4.5-2.598V6.804c0-2.31-2.5-3.753-4.5-2.598l-1.898 1.096c-.785-1.355-2.587-1.971-4.102-1.096zM16 7.382v9.237l2.5 1.443a1 1 0 0 0 1.5-.866V6.804a1 1 0 0 0-1.5-.866z'},
    // 播放器图标使用 public/ 目录下的原版填充风格（iconamoon / tabler / icon-park-solid）
    play: {v:'0 0 24 24', d:'M19.5 14.598c2-1.155 2-4.041 0-5.196l-9-5.196C8.5 3.05 6 4.494 6 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598z'},
    'play-lg': {v:'0 0 24 24', d:'M19.5 14.598c2-1.155 2-4.041 0-5.196l-9-5.196C8.5 3.05 6 4.494 6 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598z'},
    pause: {v:'0 0 24 24', d:'M9 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m8 0h-2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2'},
    next: {v:'0 0 24 24', d:'M5.5 5.938a1 1 0 0 0-1.5.866v10.392a1 1 0 0 0 1.5.866L8 16.62V7.38zm2.898-.636L6.5 4.206l-.5.866l.5-.866C4.5 3.05 2 4.494 2 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598l1.898-1.096c.785 1.355 2.587 1.971 4.102 1.096l9-5.196c2-1.155 2-4.041 0-5.196l-9-5.196c-1.515-.875-3.317-.259-4.102 1.096'},
    repeat: {v:'0 0 24 24', d:'M4 12V9a3 3 0 0 1 3-3h13m-3-3l3 3l-3 3m3 3v3a3 3 0 0 1-3 3H4m3 3l-3-3l3-3', s:true},
    'repeat-1': [{type:'path',d:'M4 12V9a3 3 0 0 1 3-3h13m-3-3l3 3l-3 3m3 3v3a3 3 0 0 1-3 3H4m3 3l-3-3l3-3',fill:'none',stroke:'currentColor',strokeWidth:2},{type:'text',x:12,y:17,'text-anchor':'middle',fontSize:11,fontWeight:'bold',content:'1'}],
    // queue / list: icon-park-solid--music-list
    queue: {v:'0 0 48 48', d:'M24 19h16M24 10h16M8 38h32M8 28h32', s:true, extra:[{t:'path',d:'m8 10l8 5l-8 5z',f:'currentColor'}]},
    list: {v:'0 0 48 48', d:'M24 19h16M24 10h16M8 38h32M8 28h32', s:true, extra:[{t:'path',d:'m8 10l8 5l-8 5z',f:'currentColor'}]},
    // volume
    volume: [{type:'polygon',points:'11 5 6 9 2 9 2 15 6 15 11 19 11 5'},{type:'path',d:'M15.54 8.46a5 5 0 0 1 0 7.07'}],
    'volume-full': [{type:'polygon',points:'11 5 6 9 2 9 2 15 6 15 11 19 11 5'},{type:'path',d:'M15.54 8.46a5 5 0 0 1 0 7.07'},{type:'path',d:'M19.07 4.93a10 10 0 0 1 0 14.14'}],
    'volume-off': [{type:'polygon',points:'11 5 6 9 2 9 2 15 6 15 11 19 11 5'},{type:'line',x1:23,y1:9,x2:17,y2:15},{type:'line',x1:17,y1:9,x2:23,y2:15}],
    // search & close
    search: [{type:'circle',cx:11,cy:11,r:8},{type:'line',x1:21,y1:21,x2:16.65,y2:16.65}],
    close: [{type:'line',x1:18,y1:6,x2:6,y2:18},{type:'line',x1:6,y1:6,x2:18,y2:18}],
    // arrows
    'chevron-left': 'M15 18l-6-6 6-6',
    'chevron-right': 'M9 18l6-6-6-6',
    'chevron-down': 'M6 9l6 6 6-6',
    check: [{type:'polyline',points:'20 6 9 17 4 12'}],
    back: 'M15 18l-6-6 6-6',
    // content
    music: [{type:'path',d:'M9 18V5l12-2v13'},{type:'circle',cx:6,cy:18,r:3},{type:'circle',cx:18,cy:16,r:3}],
    'music-note': 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
    user: [{type:'path',d:'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'},{type:'circle',cx:12,cy:7,r:4}],
    // actions
    add: [{type:'line',x1:12,y1:5,x2:12,y2:19},{type:'line',x1:5,y1:12,x2:19,y2:12}],
    refresh: [{type:'polyline',points:'23 4 23 10 17 10'},{type:'path',d:'M20.49 15a9 9 0 1 1-2.12-9.36L23 10'}],
    trash: [{type:'path',d:'M3 6h18'},{type:'path',d:'M5 6l1 14a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3l1-14'},{type:'path',d:'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2'},{type:'line',x1:10,y1:11,x2:10,y2:17},{type:'line',x1:14,y1:11,x2:14,y2:17}],
    share: [{type:'circle',cx:18,cy:5,r:3},{type:'circle',cx:6,cy:12,r:3},{type:'circle',cx:18,cy:19,r:3},{type:'line',x1:8.59,y1:13.51,x2:15.42,y2:17.49},{type:'line',x1:15.41,y1:6.51,x2:8.59,y2:10.49}],
    link: [{type:'path',d:'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'},{type:'path',d:'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'}],
    more: [{type:'circle',cx:3,cy:12,r:2.8},{type:'circle',cx:12,cy:12,r:2.8},{type:'circle',cx:21,cy:12,r:2.8}],
    menu: [{type:'line',x1:4,y1:5,x2:20,y2:5},{type:'line',x1:4,y1:12,x2:20,y2:12},{type:'line',x1:4,y1:19,x2:20,y2:19}],
    // heart
    heart: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
    'heart-filled': [{type:'path',d:'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'}],
    lyrics: [{type:'line',x1:4,y1:5,x2:20,y2:5},{type:'line',x1:4,y1:12,x2:14,y2:12},{type:'line',x1:4,y1:19,x2:20,y2:19}],
    empty: [{type:'circle',cx:12,cy:12,r:10},{type:'polyline',points:'12 6 12 12 16 14'}],
  }
  let icon = $derived(ICONS[name])
  // 计算 viewBox 与根 SVG 属性（支持单 path 对象 v/s/d 简写）
  let iconViewBox = $derived(
    typeof icon === 'object' && !Array.isArray(icon) && icon.v ? icon.v : '0 0 24 24'
  )
  let iconIsStroke = $derived(
    typeof icon === 'object' && !Array.isArray(icon) && icon.s === true
  )
</script>
{#if icon}
  <svg viewBox={iconViewBox} width={size} height={size} fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" class={className} {...rest}>
    {#if typeof icon === 'string'}
      <path d={icon} fill={fill !== 'none' ? 'currentColor' : 'none'} stroke={fill !== 'none' ? 'none' : 'currentColor'} stroke-width={fill !== 'none' ? 0 : strokeWidth}/>
    {:else if Array.isArray(icon)}
      {#each icon as el}
        {#if el.type === 'path'}
          <path d={el.d} fill={el.fill || 'none'} stroke={el.stroke || 'currentColor'} stroke-width={el.strokeWidth ?? strokeWidth} stroke-linecap={el.strokeLinecap ?? 'round'} stroke-linejoin={el.strokeLinejoin ?? 'round'} opacity={el.opacity ?? 1}/>
        {:else if el.type === 'circle'}
          <circle cx={el.cx} cy={el.cy} r={el.r} fill={el.fill || 'none'} stroke={el.stroke || 'currentColor'} stroke-width={el.strokeWidth ?? strokeWidth} opacity={el.opacity ?? 1}/>
        {:else if el.type === 'line'}
          <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}/>
        {:else if el.type === 'polygon'}
          <polygon points={el.points} fill={el.fill || 'none'} stroke={el.stroke || 'currentColor'} stroke-width={el.strokeWidth ?? strokeWidth} opacity={el.opacity ?? 1}/>
        {:else if el.type === 'polyline'}
          <polyline points={el.points}/>
        {:else if el.type === 'text'}
          <text x={el.x} y={el.y} text-anchor={el['text-anchor'] || 'middle'} font-size={el.fontSize || 11} font-weight={el.fontWeight || 'bold'} fill="currentColor" stroke="none">{el.content}</text>
        {/if}
      {/each}
    {:else if typeof icon === 'object'}
      <!-- 单 path 对象简写：{v, d, s, extra}  s=true 表示描边图标，否则填充 -->
      <path d={icon.d} fill={iconIsStroke ? 'none' : 'currentColor'} stroke={iconIsStroke ? 'currentColor' : 'none'} stroke-width={iconIsStroke ? (icon.strokeWidth ?? strokeWidth) : 0} stroke-linecap="round" stroke-linejoin="round"/>
      {#if icon.extra}
        {#each icon.extra as el}
          {#if el.t === 'path'}
            <path d={el.d} fill={el.f || 'currentColor'} stroke="none"/>
          {/if}
        {/each}
      {/if}
    {/if}
  </svg>
{/if}

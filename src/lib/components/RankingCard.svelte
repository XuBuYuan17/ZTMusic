<script>
  let {
    ranking = {},
    onViewDetail
  } = $props()
</script>

<div class="ranking-card" onclick={() => onViewDetail?.(ranking)}>
  <div class="ranking-cover">
    {#if ranking.coverImgUrl}
      <img src={ranking.coverImgUrl + '?param=200y200'} alt={ranking.name} />
    {:else}
      <div class="ranking-cover-placeholder">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      </div>
    {/if}
    <div class="ranking-play-btn">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
    </div>
  </div>
  <div class="ranking-info">
    <div class="ranking-name">{ranking.name}</div>
    {#if ranking.updateFrequency}
      <div class="ranking-meta">{ranking.updateFrequency}</div>
    {/if}
  </div>
</div>

<style>
  .ranking-card {
    display: flex;
    flex-direction: column;
    cursor: pointer;
    border-radius: 20px;
    overflow: hidden;
    background: rgba(255,255,255,0.03);
    backdrop-filter: blur(8px);
    box-shadow: 0 20px 40px rgba(0,0,0,0.18);
    transition: transform 0.22s, box-shadow 0.22s;
  }

  .ranking-card:hover {
    transform: translateY(-8px);
    box-shadow: 0 30px 60px rgba(0,0,0,0.24);
  }

  .ranking-cover {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
  }

  .ranking-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.4s ease;
  }

  .ranking-card:hover .ranking-cover img {
    transform: scale(1.03);
  }

  .ranking-cover-placeholder {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, var(--accent), #ff6b5f);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255,255,255,0.7);
  }

  .ranking-play-btn {
    position: absolute;
    bottom: 10px;
    right: 10px;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgba(255,255,255,0.88);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transform: scale(0.85);
    transition: all 0.2s;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    backdrop-filter: blur(8px);
  }

  .ranking-card:hover .ranking-play-btn {
    opacity: 1;
    transform: scale(1);
  }

  .ranking-info {
    padding: 14px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .ranking-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ranking-meta {
    font-size: 12px;
    color: var(--text-tertiary);
    line-height: 1.3;
  }
</style>

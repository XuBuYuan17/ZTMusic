<script lang="ts">
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'

  let { onComplete }: { onComplete: () => void } = $props()
  const noteMask = $props.id()
  const motion = matchMedia('(prefers-reduced-motion: reduce)')

  onMount(() => {
    if (motion.matches) {
      onComplete()
      return
    }
    const completeReducedMotion = () => { if (motion.matches) onComplete() }
    motion.addEventListener('change', completeReducedMotion)
    const fallback = window.setTimeout(onComplete, 1980)
    return () => {
      window.clearTimeout(fallback)
      motion.removeEventListener('change', completeReducedMotion)
    }
  })
</script>

<div class="launch-animation" role="status" aria-label="正在启动哲听" out:fade={{ duration: motion.matches ? 0 : 210 }}>
  <div class="launch-brand" aria-hidden="true">
    <svg viewBox="0 0 1254 1254" aria-hidden="true">
      <g transform="translate(42 24)">
        <defs>
          <mask id={noteMask} maskUnits="userSpaceOnUse" x="0" y="0" width="1254" height="1254">
            <rect width="1254" height="1254" fill="black"/>
            <path class="note-ink" pathLength="1" fill="none" stroke="white" stroke-width="142" stroke-linecap="round" stroke-linejoin="round"
              d="M620 766 C654 722 616 677 562 711 C496 753 498 864 607 885 C729 902 775 817 749 710 C729 627 695 531 730 498 C757 482 809 610 881 569"/>
          </mask>
        </defs>
        <!-- 唱片主体；所有元素均为矢量形状 -->
        <circle class="disc" cx="645" cy="717" r="416" fill="var(--launch-ink)"/>
        <g class="grooves" fill="none" stroke="var(--launch-paper)" stroke-width="15" stroke-linecap="round">
          <path d="M271 704 A375 375 0 0 1 667 337"/>
          <path d="M308 698 A338 338 0 0 1 655 375"/>
          <path d="M1017 700 A375 375 0 0 1 609 1094"/>
          <path d="M980 700 A338 338 0 0 1 634 1056"/>
        </g>
        <!-- 螺旋音符：独立路径 + 线条蒙版绘制动效 -->
        <g mask={'url(#' + noteMask + ')'}>
          <path fill="var(--launch-paper)" d="M665 738 C682 714 663 681 627 680 C582 679 546 713 536 756 C519 829 577 884 647 873 C723 861 743 803 718 722 C694 644 663 550 699 495 C720 461 752 448 782 482 C831 537 867 575 904 550 C897 593 850 608 807 588 C770 569 750 542 730 526 C725 563 748 625 766 693 C786 768 800 829 759 880 C708 944 609 949 531 914 C452 876 431 792 473 711 C511 636 589 610 653 647 C708 678 713 747 667 789 C644 810 608 811 590 788 C571 765 593 736 620 737 C641 738 654 748 665 738 Z"/>
        </g>
        <!-- 灵梦蝴蝶结：独立图层，可替换成其他角色配饰 -->
        <g class="bow" fill="var(--launch-ink)" stroke-linejoin="round">
          <path d="M417 284 C319 245 224 230 143 271 C130 278 135 294 148 315 C163 345 161 372 188 395 C208 410 226 431 235 458 C279 430 348 367 417 316 Z"/>
          <path d="M438 259 C449 159 509 104 575 61 C587 54 596 81 606 107 C624 136 649 161 657 199 C661 239 665 260 679 294 C593 300 512 313 445 320 Z"/>
          <path d="M386 325 C294 375 204 452 110 590 L164 607 L206 651 C233 579 270 507 327 435 L415 349 Z"/>
          <path fill="var(--launch-paper)" d="M241 474 C201 509 171 550 143 588 L174 599 L195 616 C213 567 239 524 261 489 Z"/>
          <path fill="var(--launch-paper)" d="M176 284 L215 270 L250 292 L228 325 L273 342 L257 367 L288 385 L268 427 L239 414 L252 388 L221 370 L237 344 L196 329 L216 299 Z"/>
          <path fill="var(--launch-paper)" d="M548 98 L575 105 L555 145 L606 163 L582 199 L635 224 L615 260 L651 291 L610 294 L587 271 L607 235 L552 208 L574 174 L521 157 Z"/>
          <g transform="rotate(-29 429 297)"><rect x="369" y="240" width="120" height="114" rx="27" fill="var(--launch-ink)"/><rect x="383" y="251" width="92" height="92" rx="22" fill="var(--launch-paper)"/></g>
        </g>
      </g>
    </svg>
    <div class="launch-wordmark" onanimationend={onComplete}>
      <strong>哲听</strong>
      <span>ZHETING</span>
    </div>
  </div>
</div>

<style>
  .launch-animation {
    --launch-paper: var(--launch-base, var(--bg, #0a0a0a));
    --launch-ink: #080808;
    position: fixed;
    inset: 0;
    z-index: 100000;
    display: grid;
    place-items: center;
    overflow: hidden;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    background: var(--launch-paper);
    color: var(--launch-ink);
  }
  :global(html[data-theme='dark']) .launch-animation { --launch-ink: #f5f5f5; }
  .launch-brand { width: min(62vw, 43dvh, 288px); text-align: center; transform: translateY(-3dvh); }
  .launch-brand svg { display: block; width: 100%; height: auto; overflow: visible; }
  .disc, .grooves { transform-origin: 645px 717px; }
  .bow { transform-origin: 430px 300px; }
  .note-ink { stroke-dasharray: 1; }
  .launch-wordmark { display: grid; gap: 7px; margin-top: clamp(9px, 2dvh, 18px); }
  .launch-wordmark strong { font-size: clamp(24px, 4.4dvh, 32px); font-weight: 500; letter-spacing: .38em; padding-left: .38em; }
  .launch-wordmark span { font-size: 11px; font-weight: 500; letter-spacing: .32em; padding-left: .32em; opacity: .7; }

  @media (prefers-reduced-motion: no-preference) {
    .disc { animation: launch-disc .52s cubic-bezier(.16,1,.3,1) both; }
    .grooves { animation: launch-grooves 1.02s .12s cubic-bezier(.12,.79,.22,1) both; }
    .note-ink { animation: launch-note .72s .38s cubic-bezier(.45,.05,.22,1) both; }
    .bow { animation: launch-bow .58s 1.02s cubic-bezier(.16,1,.3,1) both; }
    .launch-wordmark { animation: launch-wordmark .47s 1.48s ease-out both; }
  }

  @keyframes launch-disc {
    from { opacity: 0; transform: scale(.72); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes launch-grooves {
    from { opacity: 0; transform: rotate(-250deg); }
    25% { opacity: 1; }
    to { opacity: 1; transform: rotate(0deg); }
  }
  @keyframes launch-note {
    from { stroke-dashoffset: 1; }
    to { stroke-dashoffset: 0; }
  }
  @keyframes launch-bow {
    0% { opacity: 0; transform: translate(-42px,-125px) rotate(-10deg) scale(.93); }
    66% { opacity: 1; transform: translate(0,6px) rotate(2deg) scale(1.015); }
    100% { opacity: 1; transform: none; }
  }
  @keyframes launch-wordmark {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: none; }
  }
</style>

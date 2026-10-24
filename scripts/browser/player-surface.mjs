import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(pathToFileURL(process.env.PR9_PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ headless: true, ...(process.env.ZT_BROWSER_CHANNEL ? { channel: process.env.ZT_BROWSER_CHANNEL } : {}) })
const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true })
const page = await context.newPage()
const errors = []
const results = []
page.on('pageerror', error => errors.push(error.message))
const phase = value => page.waitForFunction(value => window.mobileFixture.surface.phase === value, value)
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const surface = () => page.evaluate(() => {
  const controller = window.mobileFixture.surface
  const shared = document.querySelector('.player-surface-cover')
  const cover = document.querySelector('.ly-container .am-flying-cover')
  return { phase: controller.phase, p: controller.sheetProgress.get(),
    shared: shared?.getBoundingClientRect().toJSON(), cover: cover?.getBoundingClientRect().toJSON(),
    sharedOpacity: shared && getComputedStyle(shared).opacity,
    sharedVisibility: shared && getComputedStyle(shared).visibility,
    sharedImageLoaded: !!shared?.querySelector('img')?.naturalWidth,
    nav: document.querySelector('.mobile-tab-bar').style.transform,
    modal: !!document.querySelector('.ly-fullscreen'), sharedCount: document.querySelectorAll('.player-surface-cover').length }
})
const near = (left, right, label) => {
  assert.ok(left && right, `${label}: missing rect`)
  for (const key of ['left', 'top', 'width', 'height']) assert.ok(Math.abs(left[key] - right[key]) < 1.5, `${label}: ${key} jumps from ${left[key]} to ${right[key]}`)
}
const pointer = async (type, x, y, target) => {
  const init = { pointerId: 91, isPrimary: true, pointerType: 'touch', button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }
  if (target) await page.dispatchEvent(target, type, init)
  else await page.evaluate(({ type, init }) => window.dispatchEvent(new PointerEvent(type, init)), { type, init })
}

try {
  await mkdir('browser-artifacts', { recursive: true })
  await page.goto(`${process.env.ZT_BROWSER_BASE || 'http://127.0.0.1:5184'}/scripts/browser/mobile-render.html`)
  await page.waitForFunction(() => window.mobileFixture?.surface)
  for (const viewport of [{ width: 320, height: 480 }, { width: 375, height: 667 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport)
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
      const mini = page.locator('.player-bar-wrap .mini-player-open')
      await mini.focus()
      await page.keyboard.press('Enter')
      await phase('open')
      await frames()
      let state = await surface()
      assert.equal(state.sharedCount, 0)
      assert.ok(state.cover.width > 0)
      assert.ok(Math.abs(state.cover.width - state.cover.height) < 1)
      await page.screenshot({ path: `browser-artifacts/player-surface-${viewport.width}x${viewport.height}-${theme}.png` })
      await page.keyboard.press('Escape')
      await phase('closed')
      await page.waitForSelector('.ly-fullscreen', { state: 'detached' })
      assert.ok(await mini.evaluate(node => document.activeElement === node), 'focus returns to the mini-player button')

      const miniRect = await mini.boundingBox()
      const x = miniRect.x + 30, y = miniRect.y + miniRect.height / 2
      const travel = Math.min(440, Math.max(300, viewport.height * .45))
      await pointer('pointerdown', x, y, '.player-bar-wrap .mini-player-open')
      await pointer('pointermove', x, y - travel * .7)
      await frames()
      state = await surface()
      assert.ok(Math.abs(state.p - .7) < .01)
      assert.equal(state.nav, 'translateY(70%)')
      assert.equal(state.sharedOpacity, '1', 'shared artwork is visible throughout the morph')
      assert.equal(state.sharedVisibility, 'visible')
      assert.equal(state.sharedImageLoaded, true, 'the visible shared layer contains the loaded artwork')
      assert.ok(Math.abs(state.shared.width - state.shared.height) < 1)
      await pointer('pointermove', x, y - travel * .5)
      await frames()
      state = await surface()
      assert.ok(Math.abs(state.p - .5) < .01, 'the same pointer reverses without endpoint reset')
      await pointer('pointercancel', x, y - travel * .5)
      await phase('closed')

      await page.evaluate(() => window.mobileFixture.openPlayer())
      await page.waitForFunction(() => {
        const c = window.mobileFixture.surface
        return c.phase === 'animating' && c.sheetProgress.get() > .1 && c.sheetProgress.get() < .95
      })
      const reversal = await page.evaluate(() => {
        const c = window.mobileFixture.surface, before = c.sheetProgress.get()
        c.close()
        const after = c.sheetProgress.get()
        c.open()
        return { before, after, reopened: c.sheetProgress.get() }
      })
      assert.equal(reversal.before, reversal.after)
      assert.equal(reversal.after, reversal.reopened)
      await phase('open')

      // Freeze a mode transition, reverse the sheet, then hand back to that mode.
      await page.locator('.ly-container .am-flying-cover').click()
      await page.evaluate(() => { window.mobileFixture.closePlayer(); window.mobileFixture.openPlayer() })
      await phase('open')
      await page.waitForTimeout(450)
      for (let i = 0; i < 10; i++) await page.locator('.ly-container .am-flying-cover').dispatchEvent('click')
      await page.waitForTimeout(450)
      state = await surface()
      assert.ok(Math.abs(state.cover.width - state.cover.height) < 1)
      assert.equal(state.sharedCount, 0)

      const scroll = await page.locator('.am-lyrics-area').evaluate(node => {
        const line = node.querySelector('.am-lyric-line')
        if (line) for (let i = 0; i < 20; i++) node.firstElementChild.append(line.cloneNode(true))
        node.scrollTop = 40
        return { top: node.scrollTop, touch: getComputedStyle(node).touchAction }
      })
      assert.equal(scroll.touch, 'pan-y')
      assert.ok(scroll.top > 0, 'lyrics keep their own scroll container')

      // The top queue consumes Escape before the player is allowed to collapse.
      await page.evaluate(() => document.querySelector('.am-mobile-footer button[aria-label="播放队列"]')?.click())
      await page.keyboard.press('Escape')
      assert.equal((await surface()).phase, 'open')
      await page.evaluate(() => window.mobileFixture.closePlayer())
      await phase('closed')
      results.push({ ...viewport, theme, status: 'passed' })
      console.log(`player surface: ${viewport.width}x${viewport.height} ${theme} passed`)
    }
  }

  await page.evaluate(() => window.mobileFixture.setDesktopTitlebar(true))
  const desktopResults = []
  for (const viewport of [{ width: 375, height: 667 }, { width: 400, height: 720 }, { width: 400, height: 700 }, { width: 400, height: 701 }, { width: 420, height: 800 }]) {
    await page.setViewportSize(viewport)
    await page.evaluate(() => window.mobileFixture.openPlayer())
    await phase('open')
    await frames()
    const layout = await page.evaluate(() => {
      const handle = document.querySelector('.m-player-dismiss')
      const handleRect = handle.getBoundingClientRect()
      const titlebarRect = document.querySelector('.fixture-titlebar').getBoundingClientRect()
      const coverRect = document.querySelector('.ly-container .am-flying-cover').getBoundingClientRect()
      const titleRect = document.querySelector('.am-track-info').getBoundingClientRect()
      const hit = document.elementFromPoint(handleRect.left + handleRect.width / 2, handleRect.top + handleRect.height / 2)
      return { handle: handleRect.toJSON(), titlebar: titlebarRect.toJSON(), cover: coverRect.toJSON(), title: titleRect.toJSON(), handleHit: !!hit && handle.contains(hit) }
    })
    assert.ok(layout.handle.top >= layout.titlebar.bottom, 'the full dismiss handle clears the desktop titlebar')
    assert.equal(layout.handleHit, true, 'the titlebar cannot intercept dismiss input')
    assert.ok(layout.cover.top >= layout.handle.bottom, 'the cover fits below the reserved header and handle')
    assert.ok(layout.cover.bottom <= layout.title.top, 'cover geometry fits its grid row without overlapping the title')
    assert.ok(Math.abs(layout.cover.width - layout.cover.height) < 1)
    await page.screenshot({ path: `browser-artifacts/player-surface-desktop-${viewport.width}x${viewport.height}.png` })
    await page.locator('.m-player-dismiss').click()
    await phase('closed')

    const mini = await page.locator('.mini-player-artwork').boundingBox()
    await page.evaluate(() => window.mobileFixture.surface.beginDrag(700))
    await frames()
    let state = await surface()
    near(state.shared, { left: mini.x, top: mini.y, width: mini.width, height: mini.height }, 'desktop mini artwork origin')
    const travel = Math.min(440, Math.max(300, viewport.height * .45))
    await page.evaluate(travel => window.mobileFixture.surface.dragTo(700 - travel * .7), travel)
    await frames()
    state = await surface()
    assert.equal(state.sharedOpacity, '1')
    assert.ok(Math.abs(state.shared.left - (mini.x + (layout.cover.left - mini.x) * .7)) < 1.5)
    assert.ok(Math.abs(state.shared.top - (mini.y + (layout.cover.top - mini.y) * .7)) < 1.5, 'titlebar avoidance preserves viewport-based morph coordinates')
    await page.evaluate(() => window.mobileFixture.surface.cancelDrag())
    await phase('closed')
    desktopResults.push({ ...viewport, status: 'passed' })
    console.log(`player surface: desktop titlebar ${viewport.width}x${viewport.height} passed`)
  }
  await page.evaluate(() => window.mobileFixture.setDesktopTitlebar(false))

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => window.mobileFixture.openPlayer())
  await phase('open')
  assert.equal((await surface()).sharedCount, 0)
  await page.evaluate(() => window.mobileFixture.closePlayer())
  await phase('closed')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.evaluate(() => window.mobileFixture.seekForSurfaceTest())
  await page.evaluate(() => window.mobileFixture.openPlayer())
  await phase('open')
  const slider = await page.locator('.am-progress-bar').boundingBox()
  await page.mouse.move(slider.x + 4, slider.y + slider.height / 2)
  await page.mouse.down()
  await page.mouse.move(slider.x + slider.width * .6, slider.y + slider.height / 2, { steps: 5 })
  await page.mouse.up()
  assert.equal((await surface()).phase, 'open', 'slider dragging cannot close the sheet')
  assert.ok(Number(await page.locator('.am-progress-bar').getAttribute('aria-valuenow')) > 90)

  await page.evaluate(() => {
    document.querySelector('.ly-container .am-flying-cover').click()
    window.mobileFixture.closePlayer()
  })
  await frames()
  const handoff = await surface()
  if (handoff.shared) assert.ok(Math.abs(handoff.shared.width - (44 + (handoff.cover.width - 44) * handoff.p)) < 1.5, 'pending mode layout is measured before the next paint')
  await page.evaluate(() => window.mobileFixture.openPlayer())
  await phase('open')
  await page.setViewportSize({ width: 375, height: 667 })
  await frames()
  assert.ok((await surface()).cover.width > 0)
  await page.evaluate(() => window.mobileFixture.closePlayer())
  await phase('closed')

  for (const artwork of ['', '/__missing_surface_cover__.png']) {
    await page.evaluate(value => { window.mobileFixture.setSurfaceArtwork(value); window.mobileFixture.openPlayer() }, artwork)
    await phase('open')
    assert.ok((await surface()).cover.width > 0, 'missing and broken artwork retain measurable cover slots')
    await page.evaluate(() => window.mobileFixture.closePlayer())
    await phase('closed')
  }
  assert.deepEqual(errors, [], 'browser runtime errors')
  await writeFile('browser-artifacts/player-surface-results.json', JSON.stringify({ results, desktopResults, errors }, null, 2))
  console.log(JSON.stringify({ results, desktopResults, reducedMotion: 'passed', resize: 'passed', errors }))
} finally {
  await context.close()
  await browser.close()
}

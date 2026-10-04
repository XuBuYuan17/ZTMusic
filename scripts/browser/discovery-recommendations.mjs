import assert from 'node:assert/strict'

export async function reviewDiscovery(page, capture, metrics) {
  await page.evaluate(() => { window.mobileFixture.logout(); window.mobileFixture.navigate('explore') })
  await page.waitForTimeout(600)
  const before = await page.evaluate(() => ({ ...window.recommendationCalls }))
  await page.locator('[data-discovery="daily"]').click()
  assert.equal(await page.evaluate(() => window.loginRequests), 1)
  assert.deepEqual(await page.evaluate(() => window.recommendationCalls), before, 'logged-out entrance must not request recommendations')
  await page.evaluate(() => { window.mobileFixture.login(); window.mobileFixture.enableSilentPlayback() })
  await page.waitForTimeout(300)

  metrics.discoveryLayouts = []
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme)
    for (const width of [320, 360, 390, 412]) {
      await page.setViewportSize({ width, height: 844 })
      const layout = await page.locator('.discovery-shortcuts').evaluate(root => {
        const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right } }
        return { root: box(root), scroll: document.documentElement.scrollWidth, buttons: [...root.querySelectorAll('.discovery-shortcut')].map(node => ({
          ...box(node), label: box(node.querySelector('.discovery-shortcut__label')),
          iconBackground: getComputedStyle(node.querySelector('.discovery-shortcut__icon')).backgroundColor,
        })) }
      })
      assert.equal(layout.buttons.length, 4)
      assert.ok(layout.buttons.every(button => Math.abs(button.y - layout.buttons[0].y) < 1), 'four entrances stay on one row')
      assert.ok(layout.buttons.every(button => button.width >= 48 && button.height >= 48 && button.label.width <= button.width + 1 && button.right <= width), 'touch targets or labels overflow')
      assert.ok(layout.scroll <= width)
      assert.ok(layout.buttons.every(button => button.iconBackground !== 'rgba(0, 0, 0, 0)'), 'theme background missing')
      metrics.discoveryLayouts.push({ theme, width, ...layout })
      if (width === 390) await capture('discovery_' + theme)
    }
  }
  assert.notEqual(metrics.discoveryLayouts[2].buttons[0].iconBackground, metrics.discoveryLayouts[6].buttons[0].iconBackground)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.locator('[data-discovery="daily"]').click()
  await page.locator('.mobile-route-page:not([inert]) .daily-recommendations__song').first().waitFor()
  assert.equal(await page.locator('.mobile-route-page:not([inert]) .daily-recommendations__song').count(), 12)
  assert.equal(await page.evaluate(() => window.mobileFixture.snapshot().view), 'dailyRecommendations')
  await page.waitForTimeout(650)
  await capture('daily_recommendations')
  await page.locator('.mobile-route-page:not([inert]) .daily-recommendations__song').nth(4).click()
  assert.equal(await page.evaluate(() => window.mobileFixture.snapshot().index), 4)
  assert.equal(await page.evaluate(() => window.mobileFixture.snapshot().queue.length), 12)
  await page.evaluate(() => window.mobileFixture.back())
  await page.waitForTimeout(600)

  await page.locator('[data-discovery="heart"]').click()
  await page.waitForFunction(() => window.mobileFixture.snapshot().kind === 'heart')
  metrics.heart = await page.evaluate(() => ({ request: window.heartRequest, ...window.mobileFixture.snapshot() }))
  assert.equal(metrics.heart.request.pid, 9001)
  assert.equal(metrics.heart.request.id, 1005)
  assert.equal(metrics.heart.queue.length, 12)
  assert.equal(await page.locator('[data-discovery="heart"]').getAttribute('aria-pressed'), 'true')

  await page.locator('[data-discovery="roaming"]').click()
  await page.waitForFunction(() => window.mobileFixture.snapshot().kind === 'roaming' && !window.mobileFixture.snapshot().busy)
  metrics.roamingStart = await page.evaluate(() => window.mobileFixture.snapshot())
  assert.equal(metrics.roamingStart.queue.length, 6)
  assert.equal(metrics.roamingStart.index, 0)
  assert.equal(metrics.roamingStart.id, 2001)
  await page.evaluate(() => window.mobileFixture.navigate('library'))
  await page.evaluate(() => { window.mobileFixture.advance(); window.mobileFixture.advance(); window.mobileFixture.advance() })
  await page.waitForFunction(() => window.mobileFixture.snapshot().queue.length === 9 && !window.mobileFixture.snapshot().busy)
  metrics.roamingRefilled = await page.evaluate(() => window.mobileFixture.snapshot())
  assert.equal(metrics.roamingRefilled.view, 'library')
  assert.equal(metrics.roamingRefilled.index, 3)
  assert.equal(metrics.roamingRefilled.id, 2004)
  await page.evaluate(() => { window.mobileFixture.advance(); window.mobileFixture.advance(); window.mobileFixture.advance() })
  await page.waitForFunction(() => window.mobileFixture.snapshot().busy)
  await page.evaluate(() => window.mobileFixture.normalPlayback())
  await page.waitForTimeout(250)
  assert.deepEqual(await page.evaluate(() => window.mobileFixture.snapshot().queue), [555], 'late FM batch overwrote a normal queue')
  assert.equal(await page.evaluate(() => window.mobileFixture.snapshot().kind), null)

  await page.evaluate(() => window.mobileFixture.navigate('explore'))
  await page.waitForTimeout(600)
  await page.locator('[data-discovery="radar"]').click()
  await page.waitForFunction(() => window.mobileFixture.snapshot().selectedId === 3136952023)
  await page.locator('.mobile-route-page:not([inert]) .playlist-cover').waitFor()
  metrics.radar = await page.evaluate(() => window.mobileFixture.snapshot())
  await page.waitForTimeout(600)
  await capture('private_radar')
  await page.evaluate(() => window.mobileFixture.back())
  await page.waitForTimeout(600)
  assert.equal(await page.evaluate(() => window.mobileFixture.snapshot().view), 'explore')
  await page.locator('[data-discovery="roaming"]').click()
  await page.waitForFunction(() => window.mobileFixture.snapshot().busy)
  await page.evaluate(() => window.mobileFixture.logout())
  await page.waitForTimeout(300)
  assert.deepEqual(await page.evaluate(() => window.mobileFixture.snapshot().queue), [555], 'logged-out start response must be discarded')
  assert.equal(await page.evaluate(() => window.mobileFixture.snapshot().kind), null)
}

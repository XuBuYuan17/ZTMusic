import assert from 'node:assert/strict'

export async function reviewDiscovery(page, capture, metrics) {
  await page.evaluate(() => { window.mobileFixture.logout(); window.mobileFixture.navigate('explore') })
  await page.waitForTimeout(650)
  const before = await page.evaluate(() => ({ ...window.recommendationCalls }))
  await page.locator('[data-discovery="daily"]').click()
  assert.equal(await page.evaluate(() => window.loginRequests), 1)
  assert.deepEqual(await page.evaluate(() => window.recommendationCalls), before, 'logged-out card must not fetch recommendations')
  await page.evaluate(() => { window.mobileFixture.login(); window.mobileFixture.enableSilentPlayback(); window.mobileFixture.normalPlayback() })
  await page.waitForTimeout(300)

  const active = '.mobile-route-page:not([inert])'
  const row = '.discovery-playlists'
  metrics.discoveryLayouts = []
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme)
    await page.waitForTimeout(650)
    for (const width of [320, 360, 390, 412]) {
      await page.setViewportSize({ width, height:844 })
      const layout = await page.evaluate(() => {
        const personal = document.querySelector('.discovery-playlists')
        const normal = document.querySelector('[aria-label="推荐歌单"]')
        const card = node => {
          const img = node.querySelector('img'), r = img.getBoundingClientRect(), style = getComputedStyle(img), label = getComputedStyle(node.querySelector('strong'))
          return { width:r.width, height:r.height, radius:style.borderRadius, objectFit:style.objectFit, labelSize:label.fontSize, loaded:img.naturalWidth > 0, dataMotion:node.dataset.motion }
        }
        return { above: !!(personal.compareDocumentPosition(normal) & Node.DOCUMENT_POSITION_FOLLOWING), overflow: document.documentElement.scrollWidth,
          cards:[...personal.querySelectorAll('.mobile-cover-item')].map(card), normal:card(normal.querySelector('.mobile-cover-item')),
          rowStyle:getComputedStyle(personal.querySelector('.mobile-cover-rail')).gridAutoFlow }
      })
      assert.ok(layout.above, 'four playlists must appear immediately above recommended playlists')
      assert.equal(layout.cards.length, 4)
      assert.equal(layout.rowStyle, 'column', 'four cards must share the normal horizontal playlist row')
      assert.ok(layout.overflow <= width)
      for (const card of layout.cards) {
        assert.equal(card.width, layout.normal.width)
        assert.equal(card.height, layout.normal.height)
        assert.equal(card.radius, layout.normal.radius)
        assert.equal(card.objectFit, layout.normal.objectFit)
        assert.equal(card.labelSize, layout.normal.labelSize)
        assert.ok(card.loaded)
        assert.equal(card.dataMotion, 'card')
      }
      metrics.discoveryLayouts.push({ theme, width, ...layout })
      if (width === 390) { await page.locator(row).scrollIntoViewIfNeeded(); await capture('discovery_playlists_' + theme) }
    }
  }
  await page.setViewportSize({ width:390, height:844 })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  const sampleFlight = async () => page.evaluate(() => {
    const node = document.querySelector('.shared-cover-flight')
    if (!node) return null
    const animation = node.getAnimations()[0]
    if (!animation) return null
    const timing = animation.effect.getTiming()
    animation.pause(); animation.currentTime = Number(timing.duration) * .5
    const r = node.getBoundingClientRect()
    animation.play()
    return { width:r.width, image:node.naturalWidth, duration:timing.duration, easing:timing.easing }
  })
  async function openCard(key, count) {
    const previous = await page.evaluate(() => window.mobileFixture.snapshot())
    await page.locator('[data-discovery="' + key + '"]').click()
    await page.waitForSelector('.shared-cover-flight')
    const flight = await sampleFlight()
    assert.ok(flight && flight.image > 0 && flight.width > 140, key + ': shared-cover intermediate frame missing')
    assert.equal(flight.duration, 460)
    assert.equal(flight.easing, 'cubic-bezier(0.3, 0, 0.2, 1)')
    await page.locator(active + ' .track-table tbody tr[role="button"]').first().waitFor()
    await page.waitForTimeout(650)
    const current = await page.evaluate(() => window.mobileFixture.snapshot())
    assert.equal(current.view, 'recommendation')
    assert.deepEqual(current.queue, previous.queue, key + ': opening a playlist must not play music')
    assert.equal(current.id, previous.id)
    assert.equal(await page.locator(active + ' .track-table tbody tr[role="button"]').count(), count)
    assert.equal(await page.locator(active + ' .playlist-cover').evaluate(img => img.naturalWidth > 0), true)
    await capture('discovery_playlist_' + key)
    metrics[key + 'Enter'] = flight
  }
  async function back(key) {
    await page.evaluate(() => window.mobileFixture.back())
    await page.waitForSelector('.shared-cover-flight')
    const flight = await sampleFlight()
    assert.ok(flight && flight.image > 0 && flight.width > 140)
    assert.equal(flight.duration, 400)
    await page.waitForTimeout(650)
    assert.equal(await page.evaluate(() => window.mobileFixture.snapshot().view), 'explore')
    assert.equal(await page.locator('.shared-cover-flight').count(), 0)
    metrics[key + 'Return'] = flight
  }

  await openCard('daily', 12)
  await page.locator(active + ' .track-table tbody tr[role="button"]').nth(4).click()
  assert.equal(await page.evaluate(() => window.mobileFixture.snapshot().index), 4)
  await back('daily')
  await openCard('heart', 12)
  assert.equal(await page.evaluate(() => window.heartRequest.pid), 9001)
  assert.equal(await page.evaluate(() => window.heartRequest.id), 1005)
  await page.locator(active + ' .track-table tbody tr[role="button"]').first().click()
  assert.equal(await page.evaluate(() => window.mobileFixture.snapshot().kind), 'heart')
  await back('heart')

  await openCard('roaming', 3)
  assert.equal(await page.evaluate(() => window.mobileFixture.snapshot().kind), 'heart', 'opening roaming cannot change the active mode')
  await page.locator(active + ' .playlist-shuffle-btn').click()
  assert.equal(await page.evaluate(() => window.mobileFixture.snapshot().mode), 'shuffle', 'random playback must not be overwritten by roaming')
  await page.locator(active + ' .track-table tbody tr[role="button"]').first().click()
  await page.waitForFunction(() => window.mobileFixture.snapshot().kind === 'roaming' && !window.mobileFixture.snapshot().busy)
  assert.equal(await page.evaluate(() => window.mobileFixture.snapshot().queue.length), 6)
  assert.equal(await page.locator(active + ' .track-table tbody tr[role="button"]').count(), 6, 'refills must appear in the playlist as well as the queue')
  await back('roaming')
  await page.evaluate(() => window.mobileFixture.navigate('library'))
  await page.evaluate(() => { window.mobileFixture.advance(); window.mobileFixture.advance(); window.mobileFixture.advance() })
  await page.waitForFunction(() => window.mobileFixture.snapshot().queue.length === 9 && !window.mobileFixture.snapshot().busy)
  metrics.roamingRefilled = await page.evaluate(() => window.mobileFixture.snapshot())
  assert.equal(metrics.roamingRefilled.view, 'library')
  assert.equal(metrics.roamingRefilled.index, 3)
  await page.evaluate(() => { window.mobileFixture.advance(); window.mobileFixture.advance(); window.mobileFixture.advance() })
  await page.waitForFunction(() => window.mobileFixture.snapshot().busy)
  await page.evaluate(() => window.mobileFixture.normalPlayback())
  await page.waitForTimeout(250)
  assert.deepEqual(await page.evaluate(() => window.mobileFixture.snapshot().queue), [555])
  assert.equal(await page.evaluate(() => window.mobileFixture.snapshot().kind), null)

  await page.evaluate(() => window.mobileFixture.navigate('explore'))
  await page.waitForTimeout(650)
  await openCard('radar', 12)
  assert.equal(await page.locator(active + ' .playlist-hero-copy h1').textContent(), '私人雷达')
  await back('radar')
  const calls = await page.evaluate(() => ({ ...window.recommendationCalls }))
  await openCard('daily', 12)
  assert.deepEqual(await page.evaluate(() => window.recommendationCalls), calls, 'cached list re-entry must not refetch or play')
  await page.evaluate(() => window.mobileFixture.logout())
  await page.waitForTimeout(200)
  assert.equal(await page.locator(active + ' .track-table tbody tr[role="button"]').count(), 0, 'logout clears personal tracks')
  await page.evaluate(() => window.mobileFixture.back())
  await page.waitForTimeout(650)
  await page.evaluate(() => window.mobileFixture.login())
  await page.locator('[data-discovery="roaming"]').click()
  await page.waitForSelector('.shared-cover-flight')
  await page.evaluate(() => window.mobileFixture.logout())
  await page.waitForTimeout(700)
  assert.equal(await page.locator(active + ' .track-table tbody tr[role="button"]').count(), 0, 'late account response cannot repopulate the list')
  assert.deepEqual(await page.evaluate(() => window.mobileFixture.snapshot().queue), [555])
}

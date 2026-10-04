import assert from 'node:assert/strict'

// Use real components and production CSS. Disabling only the appearance sheet
// gives a direct before/after geometry comparison for the unchanged layout.
export async function reviewLibraryAppearance(page, capture, metrics) {
  const geometry = async selector => page.locator(selector).evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect(), s = getComputedStyle(node)
    return { text:node.textContent, x:r.x, y:r.y, width:r.width, height:r.height,
      display:s.display, columns:s.gridTemplateColumns, gap:s.gap, padding:s.padding, fontSize:s.fontSize, lineHeight:s.lineHeight }
  }))
  const unchanged = async (selector, name) => {
    await page.waitForTimeout(350)
    const after = await geometry(selector)
    assert.ok(after.length, name + ': no elements')
    await page.evaluate(() => { document.getElementById('library-appearance-fixture').sheet.disabled = true })
    await page.evaluate(() => new Promise(requestAnimationFrame))
    const before = await geometry(selector)
    await page.evaluate(() => { document.getElementById('library-appearance-fixture').sheet.disabled = false })
    await page.evaluate(() => new Promise(requestAnimationFrame))
    assert.equal(after.length, before.length, name + ': element count')
    for (let i = 0; i < after.length; i++) {
      for (const key of ['x','y','width','height']) assert.ok(Math.abs(after[i][key] - before[i][key]) < .5, name + ': ' + key + ' changed')
      for (const key of ['text','display','columns','gap','padding','fontSize','lineHeight']) assert.equal(after[i][key], before[i][key], name + ': ' + key + ' changed')
    }
    metrics.libraryLayoutChecks.push({ name, elements:after.length })
  }
  const noOverflow = async selector => {
    const result = await page.locator(selector).first().evaluate(n => ({ client:n.clientWidth, scroll:n.scrollWidth }))
    assert.ok(result.scroll <= result.client + 1, selector + ': horizontal overflow')
  }
  const colorIsToken = async (selector, token) => {
    const colors = await page.locator(selector).first().evaluate((n, token) => {
      const probe = document.createElement('span')
      probe.style.color = 'var(' + token + ')'
      n.append(probe)
      const expected = getComputedStyle(probe).color
      probe.remove()
      return { actual:getComputedStyle(n).color, expected }
    }, token)
    assert.equal(colors.actual, colors.expected, selector + ': theme color')
  }
  const library = '.mobile-route-page:not([inert]) .library-page'
  const menu = '.library-options-portal .playlist-action-sheet'
  metrics.libraryLayoutChecks = []
  await page.evaluate(() => { window.mobileFixture.login(); window.mobileFixture.navigate('library') })
  await page.locator(library + ' .library-card').first().waitFor()
  await page.locator(library + ' .user-profile-hero__stats').waitFor()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(650)
  for (const theme of ['dark','light']) {
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme)
    for (const width of [360,390,412]) {
      await page.setViewportSize({ width, height:844 })
      await unchanged(library + ' :is(.user-profile-hero, .user-profile-hero__avatar, .user-profile-hero__stats, .profile-home__quick, .profile-home__quick > button, .library-mobile-tools, .library-mobile-section, .library-card, .library-card-cover)', 'library ' + theme + ' ' + width)
      await noOverflow(library)
      await colorIsToken(library + ' .user-profile-hero__stats span', '--text-secondary')
      await colorIsToken(library + ' .user-profile-hero__level', '--md-primary')
    }
    await page.setViewportSize({ width:390, height:844 })
    await capture('library_' + theme)
    await page.locator(library + ' .library-card').first().dispatchEvent('contextmenu')
    await page.locator(menu).waitFor()
    await page.waitForTimeout(400)
    assert.deepEqual((await page.locator(menu + ' .library-option').allTextContents()).map(s => s.trim()),
      ['打开歌单','加入播放队列','下一首插播','分享歌单','编辑歌单','删除歌单'])
    await unchanged(menu + ', ' + menu + ' :is(.library-options-header, .library-option)', 'owned menu ' + theme)
    await colorIsToken(menu + ' .library-option--danger', '--danger')
    assert.ok(!['INPUT','TEXTAREA'].includes(await page.evaluate(() => document.activeElement?.tagName)), 'management menu unexpectedly focuses an editor')
    await noOverflow(menu)
    await capture('library_menu_' + theme)
    await page.locator(menu + ' .mobile-choice-done').click()
    await page.locator(menu).waitFor({ state:'detached' })
    await page.locator(library + ' .library-mobile-tools button').click()
    await page.locator(library + ' .library-modal').waitFor()
    await unchanged(library + ' :is(.library-modal, .library-modal-input, .library-modal-actions, .library-modal-btn)', 'create dialog ' + theme)
    await noOverflow(library + ' .library-modal')
    await capture('library_create_' + theme)
    await page.locator(library + ' .library-modal-btn-cancel').click()
    await page.locator(library + ' .library-card').first().dispatchEvent('contextmenu')
    await page.locator(menu).waitFor()
    await page.waitForTimeout(400)
    await page.getByText('编辑歌单', { exact:true }).click()
    await page.locator(library + ' .library-modal-textarea').waitFor()
    await unchanged(library + ' :is(.library-modal, .library-modal-input, .library-modal-textarea, .library-modal-btn)', 'edit dialog ' + theme)
    await capture('library_edit_' + theme)
    await page.locator(library + ' .library-modal-btn-cancel').click()
    await page.locator(library + ' .library-card').first().dispatchEvent('contextmenu')
    await page.locator(menu).waitFor()
    await page.waitForTimeout(400)
    await page.getByText('删除歌单', { exact:true }).click()
    await page.locator(library + ' .confirm-card').waitFor()
    await unchanged(library + ' :is(.confirm-card, .confirm-actions, .confirm-btn)', 'delete confirmation ' + theme)
    await capture('library_confirm_' + theme)
    await page.locator(library + ' .confirm-btn-cancel').click()
    await page.locator(library + ' .library-card').nth(1).dispatchEvent('contextmenu')
    await page.locator(menu).waitFor()
    await page.waitForTimeout(400)
    assert.deepEqual((await page.locator(menu + ' .library-option').allTextContents()).map(s => s.trim()),
      ['打开歌单','加入播放队列','下一首插播','分享歌单','取消收藏'])
    await unchanged(menu + ', ' + menu + ' :is(.library-options-header, .library-option)', 'saved menu ' + theme)
    await page.locator(menu + ' .mobile-choice-done').click()
    await page.locator(menu).waitFor({ state:'detached' })
  }
  // Exercise the actual quick entrances and returning to the same library.
  for (const [label, selector, view] of [
    ['最近播放','.recent-page','recent'],
    ['历史日推','.daily-page','dailyHistory'],
    ['本地听歌统计','.listening-report','listeningStats'],
  ]) {
    await page.locator(library + ' .profile-home__quick > button').filter({ hasText:label }).click()
    const active = '.mobile-route-page:not([inert]) ' + selector
    await page.locator(active).waitFor()
    await page.waitForTimeout(650)
    if (view === 'recent') await page.locator(active + ' .track-table tbody tr').first().waitFor()
    if (view === 'dailyHistory') await page.locator(active + ' .daily-song-row').first().waitFor()
    await unchanged(active + ', ' + active + ' :is(button, .daily-song-row, .track-table tbody tr, .report-header, .report-hero, .report-rhythm)', view)
    await noOverflow(active)
    await capture('library_' + view)
    await page.evaluate(() => window.mobileFixture.back())
    await page.locator(library).waitFor()
    await page.waitForTimeout(650)
  }
  for (const [view, selector] of [['liked','.liked-page'],['localMusic','.local-page']]) {
    await page.evaluate(view => window.mobileFixture.navigate(view), view)
    const active = '.mobile-route-page:not([inert]) ' + selector
    await page.locator(active).waitFor()
    await page.waitForTimeout(650)
    if (view === 'liked') await page.locator(active + ' .liked-song-row').first().waitFor()
    await unchanged(active + ', ' + active + ' :is(button, input, .liked-song-row, .local-webdav)', view)
    await noOverflow(active)
    await capture('library_' + view)
    await page.evaluate(() => window.mobileFixture.back())
    await page.waitForTimeout(650)
  }
  await page.evaluate(() => { window.mobileFixture.logout(); window.mobileFixture.navigate('library') })
  await page.locator(library + ' .library-logged-out').waitFor()
  await unchanged(library + ' .library-logged-out, ' + library + ' .library-login-btn', 'logged out')
  await capture('library_logged_out')
}

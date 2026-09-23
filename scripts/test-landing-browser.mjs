// Reusable smoke test for the Codex Browser tab API.
// Serve frontend/dist, acquire a fresh Browser tab, then:
// const { testLanding } = await import('<absolute repo path>/scripts/test-landing-browser.mjs');
// await testLanding(tab, 'http://127.0.0.1:5173');
import assert from 'node:assert/strict';

export async function testLanding(tab, baseUrl) {
  await tab.goto(`${baseUrl}/?mode=human`);
  const mode = tab.playwright.locator('.dataset-mode-links');
  const gender = tab.playwright.locator('.match-gender-picker');
  await mode.waitFor({ state: 'visible' });
  assert.equal(await mode.count(), 1);
  assert.equal(await gender.count(), 1);
  assert.equal(await gender.isVisible(), true);
  assert.equal(await tab.playwright.locator('.intro h1').textContent(), '나와 닮은 인물 찾기');
  assert.equal(await tab.playwright.locator('.intro p:not(.privacy)').textContent(), '나와 닮은 인물을 찾아보세요!');
  assert.equal(await tab.playwright.locator('.gallery-count-badge span').textContent(), '인물 317개 기준으로 비교');
  for (const [label, visible, count] of [['애니 캐릭터', false, 62], ['동물', false, 38], ['인물', true, 317]]) {
    await mode.getByRole('button', { name: label, exact: true }).click();
    assert.equal(await gender.isVisible(), visible, label);
    assert.equal(await mode.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true');
    assert.match(await tab.playwright.locator('.gallery-count-badge span').textContent(), new RegExp(`${count}개`));
  }
  for (const label of ['남성', '여성', '자동']) {
    await gender.getByRole('button', { name: label, exact: true }).click();
    assert.equal(await gender.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await tab.playwright.locator('.match-gender-picker button[aria-pressed="true"]').count(), 1);
  }
  assert.equal(await tab.playwright.locator('a[href="/feed"], a[href="/community"], .community-share').count(), 0);
  assert(!(await tab.playwright.domSnapshot()).includes('결과 피드'));
  assert.equal(await mode.count(), 1, 'controls survive subsequent DOM mutations without duplication');
  const errors = await tab.dev.logs({ levels: ['error'], limit: 100 });
  assert.equal(errors.filter(e => /result-enhancer|SyntaxError|TypeError|DOMException/.test(`${e.url} ${e.message}`)).length, 0, JSON.stringify(errors));
  return { result: 'PASS', url: await tab.url(), title: await tab.title(), errors };
}

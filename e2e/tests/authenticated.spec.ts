import { expect, test } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  monitorFrontendHealth,
  openPublicLogin,
} from './helpers';

const username = process.env.PLAYWRIGHT_TEST_EMAIL;
const password = process.env.PLAYWRIGHT_TEST_PASSWORD;
const base = process.env.PLAYWRIGHT_TEST_BASE || 'natal';

test.describe('navegação autenticada', () => {
  test.skip(
    !username || !password,
    'PLAYWRIGHT_TEST_EMAIL e PLAYWRIGHT_TEST_PASSWORD não configurados; suíte pública continua obrigatória.',
  );

  test('todas as páginas permitidas ao perfil renderizam sem quebra', async ({ page }) => {
    test.setTimeout(120_000);
    const health = monitorFrontendHealth(page);

    await openPublicLogin(page);
    await page.locator('#impBase').selectOption(base);
    await page.locator('#impUser').fill(username || '');
    await page.locator('#impPassword').fill(password || '');
    await page.locator('#loginBtn').click();

    await expect(page.locator('#app')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#loginView')).toBeHidden();

    const pageIds = await page.locator('.nav-btn').evaluateAll(buttons =>
      buttons.map(button => (button as HTMLElement).dataset.page).filter(Boolean) as string[],
    );
    expect(pageIds.length, 'O perfil autenticado deve possuir navegação').toBeGreaterThan(0);

    for (const pageId of pageIds) {
      const navButton = page.locator(`.nav-btn[data-page="${pageId}"]`);
      const isMobile = (page.viewportSize()?.width || 1280) <= 980;

      if (isMobile) {
        const menu = page.locator('#menuBtn');
        if ((await menu.getAttribute('aria-expanded')) !== 'true') {
          await menu.click();
        }
      }

      await navButton.click();
      await expect(page.locator('#content')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
      await expect(page.locator('#content')).not.toContainText('Não foi possível carregar esta página');
      await expect(page.locator('#content')).not.toBeEmpty();
      await expectNoHorizontalOverflow(page);
    }

    health.assertClean();
  });
});

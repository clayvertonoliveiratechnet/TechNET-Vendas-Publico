import { expect, test, type Page } from '@playwright/test';
import { loginWithMockedAccount } from './mock-auth';

const ADMIN_PAGES = [
  'dashboard',
  'map',
  'new-sale',
  'backoffice',
  'imperium-products',
  'team',
  'territories',
  'command',
  'goals',
  'health',
  'admin',
];

async function navigateById(page: Page, pageId: string) {
  await page.locator(`#nav .nav-btn[data-page="${pageId}"]`).evaluate((button: HTMLElement) => {
    button.click();
  });
  await expect(page.locator('#content')).not.toHaveAttribute('aria-busy', 'true');
}

async function expectNoHorizontalOverflow(page: Page, pageId: string) {
  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));

  expect(
    Math.max(geometry.documentWidth, geometry.bodyWidth),
    `${pageId}: largura do documento não pode exceder viewport (${JSON.stringify(geometry)})`,
  ).toBeLessThanOrEqual(geometry.viewport + 1);
}

async function expectNoLargeLightLeaks(page: Page, pageId: string) {
  const leaks = await page.evaluate(() => {
    const candidates = [
      ...document.querySelectorAll<HTMLElement>('#content *'),
      ...document.querySelectorAll<HTMLElement>('.topbar, .sidebar, #mobileBottomNav, .apple-navbar'),
    ];
    const ignoredTags = new Set(['IMG', 'SVG', 'CANVAS', 'VIDEO', 'IFRAME']);

    return candidates.flatMap(element => {
      if (ignoredTags.has(element.tagName)) return [];
      const rect = element.getBoundingClientRect();
      if (rect.width * rect.height < 1800 || rect.width <= 0 || rect.height <= 0) return [];
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.5) return [];

      const match = style.backgroundColor.match(
        /rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)/i,
      );
      if (!match) return [];

      const [, r, g, b, alpha = '1'] = match;
      const channels = [Number(r), Number(g), Number(b)];
      if (Number(alpha) < 0.8 || !channels.every(value => value >= 205)) return [];

      return [{
        tag: element.tagName.toLowerCase(),
        id: element.id,
        className: String(element.className || '').slice(0, 160),
        background: style.backgroundColor,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        text: String(element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
      }];
    });
  });

  expect(leaks, `${pageId}: superfícies claras grandes no dark mode\n${JSON.stringify(leaks, null, 2)}`).toEqual([]);
}

test.describe('auditoria visual de layout autenticado', () => {
  test('rotas de admin não criam overflow horizontal', async ({ page }) => {
    await loginWithMockedAccount(page, 'admin');

    for (const pageId of ADMIN_PAGES) {
      await test.step(pageId, async () => {
        await navigateById(page, pageId);
        await expectNoHorizontalOverflow(page, pageId);
      });
    }
  });

  test('rotas de admin não vazam superfícies claras grandes no dark mode', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tv_theme', 'dark');
    });
    await loginWithMockedAccount(page, 'admin');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    for (const pageId of ADMIN_PAGES) {
      await test.step(pageId, async () => {
        await navigateById(page, pageId);
        await expectNoLargeLightLeaks(page, pageId);
      });
    }
  });
});

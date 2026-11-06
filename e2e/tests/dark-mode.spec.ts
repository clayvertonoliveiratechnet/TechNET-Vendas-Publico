import { expect, test, type Locator } from '@playwright/test';
import { loginWithMockedAccount } from './mock-auth';

async function expectNotLightSurface(locator: Locator) {
  await expect(locator).toBeAttached();
  const background = await locator.evaluate(element =>
    getComputedStyle(element).backgroundColor,
  );

  const values = (background.match(/[\d.]+/g) || []).map(Number);
  let channels: number[] = [];
  let alpha = 1;

  if (background.startsWith('rgb')) {
    channels = values.slice(0, 3);
    alpha = values[3] ?? 1;
  } else if (background.startsWith('color(srgb')) {
    channels = values.slice(0, 3).map(value => value * 255);
    alpha = values[3] ?? 1;
  } else {
    throw new Error(`cor de fundo não reconhecida: ${background}`);
  }

  expect(channels).toHaveLength(3);
  const opaque = alpha >= 0.5;
  const nearWhite = channels.every(value => value >= 205);

  expect(
    opaque && nearWhite,
    `superfície clara vazando no dark mode: ${background}`,
  ).toBeFalsy();
}

test.describe('modo escuro', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tv_theme', 'dark');
    });
  });

  test('login usa superfícies escuras', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectNotLightSurface(page.locator('body'));
    await expectNotLightSurface(page.locator('.login-card'));
    await expectNotLightSurface(page.locator('#impUser'));
  });

  test('navegação autenticada não vaza estados claros', async ({ page }, testInfo) => {
    await loginWithMockedAccount(page, 'admin');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('tv_theme'))).toBe('dark');

    if (testInfo.project.name === 'mobile-pixel-7') {
      await expect(page.locator('#mobileBottomNav')).toBeVisible();
      await expectNotLightSurface(page.locator('#mobileBottomNav'));
      await expectNotLightSurface(
        page.locator('#mobileBottomNav [aria-current="page"]').first(),
      );
      return;
    }

    await expect(page.locator('.apple-navbar')).toBeVisible();
    await expectNotLightSurface(page.locator('.apple-navbar'));
    await expectNotLightSurface(
      page.locator('.apple-nav-link[aria-current="page"]').first(),
    );
  });
});

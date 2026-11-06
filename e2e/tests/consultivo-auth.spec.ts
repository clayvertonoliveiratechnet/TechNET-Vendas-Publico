import { expect, test } from '@playwright/test';
import { installMockAuthenticatedBackend } from './mock-auth';

async function expectLoginFitsViewport(page: import('@playwright/test').Page) {
  const metrics = await page.evaluate(() => {
    const auth = document.querySelector('.cv-auth-screen')?.getBoundingClientRect();
    const fieldGeometry = [...document.querySelectorAll('.cv-auth-field')].map((field) => {
      const fieldRect = field.getBoundingClientRect();
      const iconRect = field.querySelector('.cv-auth-field-icon')?.getBoundingClientRect();
      const controlRect = field.querySelector('.cv-auth-control')?.getBoundingClientRect();
      return {
        fieldLeft: fieldRect.left,
        fieldRight: fieldRect.right,
        iconLeft: iconRect?.left ?? -999,
        iconRight: iconRect?.right ?? -999,
        controlLeft: controlRect?.left ?? -999,
        controlRight: controlRect?.right ?? 9999,
        controlWidth: controlRect?.width ?? 0,
      };
    });
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      scrollX: window.scrollX,
      authLeft: auth?.left ?? -999,
      authRight: auth?.right ?? 9999,
      fieldGeometry,
    };
  });
  expect(metrics.scrollX).toBe(0);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.authLeft).toBeGreaterThanOrEqual(-1);
  expect(metrics.authRight).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.fieldGeometry).toHaveLength(3);
  for (const field of metrics.fieldGeometry) {
    expect(field.fieldLeft).toBeGreaterThanOrEqual(-1);
    expect(field.fieldRight).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(field.iconLeft).toBeGreaterThanOrEqual(field.fieldLeft);
    expect(field.controlLeft).toBeGreaterThanOrEqual(field.iconRight - 1);
    expect(field.controlRight).toBeLessThanOrEqual(field.fieldRight + 1);
    expect(field.controlWidth).toBeGreaterThan(120);
  }
}

test.describe('TECHNET Consultivo auth/account', () => {
  test('exibe o login aprovado com Base, Usuário, Senha e suporte', async ({ page }) => {
    await page.goto('/consultivo.html');

    await expect(page.getByText('Bem-vindo', { exact: false })).toBeVisible();
    await expect(page.locator('#cvImpBase')).toBeVisible();
    await expect(page.locator('#cvImpUser')).toBeVisible();
    await expect(page.locator('#cvImpPassword')).toBeVisible();
    await expect(page.locator('#cvRememberAccess')).toBeAttached();
    await expect(page.locator('#cvForgotPassword')).toBeVisible();
    await expect(page.locator('#cvLoginBtn')).toContainText('Entrar');
    await expect(page.locator('#cvSupport')).toContainText('Precisa de ajuda?');
    await expectLoginFitsViewport(page);

    await page.locator('#cvImpPassword').focus();
    await page.waitForTimeout(300);
    await expectLoginFitsViewport(page);
  });

  test('entra pela autenticação corporativa, abre a conta e sai da sessão', async ({ page }) => {
    await installMockAuthenticatedBackend(page, 'consultant');
    await page.goto('/consultivo.html');

    await page.locator('#cvImpBase').selectOption('natal');
    await page.locator('#cvImpUser').fill('playwright-e2e');
    await page.locator('#cvImpPassword').fill('senha-nao-real');
    await page.locator('#cvLoginBtn').click();

    await expect(page.locator('#cvHero')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#cvHeroTitle')).toContainText('Usuário');
    await expect(page.locator('#cvAccountButton')).toBeVisible();

    await page.locator('#cvAccountButton').click();

    await expect(page.locator('.cv-account-profile')).toBeVisible();
    await expect(page.locator('.cv-account-profile')).toContainText('Usuário Playwright');
    await expect(page.locator('.cv-account-profile')).toContainText('Consultor de Vendas');
    await expect(page.locator('.cv-account-profile')).toContainText('Natal / Parnamirim');
    await expect(page.locator('#cvLogout')).toHaveText(/Sair da conta/);

    await page.locator('#cvLogout').click();

    await expect(page.locator('.cv-auth-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#cvImpUser')).toHaveValue('');
    await expectLoginFitsViewport(page);
  });
});

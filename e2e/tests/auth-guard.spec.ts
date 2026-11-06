import { expect, test } from '@playwright/test';
import { INTERNAL_PAGES } from './helpers';

for (const pageId of INTERNAL_PAGES) {
  test(`destino interno protegido "${pageId}" não abre sem sessão`, async ({ page }) => {
    await page.addInitScript(id => {
      localStorage.setItem('tv_last_page', id);
      localStorage.removeItem('technet-vendas-comercial-session');
    }, pageId);

    await page.goto('/');

    await expect(page.locator('#authBoot')).toHaveClass(/hidden/, { timeout: 15_000 });
    await expect(page.locator('#loginView')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
    await expect(page.locator('#content')).toBeEmpty();
  });
}

import { expect, test } from '@playwright/test';
import { installMockAuthenticatedBackend } from './mock-auth';

test('CONSULTIVO mostra vendas e metadados do Imperium', async ({ page }) => {
  await installMockAuthenticatedBackend(page, 'consultant');

  const now = new Date().toISOString();
  await page.route('**/rest/v1/rpc/tv_sales_page_month', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total: 2,
        approved: 1,
        analysis: 1,
        pending: 0,
        cancelled: 0,
        drafts: 0,
        items: [
          {
            id: 'sale-1',
            sold_at: now,
            created_at: now,
            status: 'synced',
            city_name: 'Natal',
            customer_name: 'Cliente Imperium',
            consultant_name: 'Usuário Playwright',
            imperium_proposal: 'PROP-9988',
            imperium_contract: 'CTR-7788',
            imperium_sale_id: 445566,
            source: 'imperium',
            real_product_summary: 'VIRTUA 600 MEGA',
          },
          {
            id: 'sale-2',
            sold_at: now,
            created_at: now,
            status: 'under_review',
            city_name: 'Natal',
            customer_name: 'Cliente TechNET',
            consultant_name: 'Usuário Playwright',
            imperium_proposal: 'PROP-1122',
            source: 'technet',
            product_summary: 'VIRTUA 400 MEGA',
          },
        ],
      }),
    });
  });

  await page.goto('/consultivo.html');
  await page.locator('#cvImpBase').selectOption('natal');
  await page.locator('#cvImpUser').fill('playwright-e2e');
  await page.locator('#cvImpPassword').fill('senha-nao-real');
  await page.locator('#cvLoginBtn').click();

  await expect(page.locator('.cv-home-commercial')).toContainText('Vendas no mês');
  await expect(page.locator('.cv-home-commercial')).toContainText('2');

  await page.getByRole('button', { name: 'Vendas', exact: true }).click();

  await expect(page.locator('.cv-commercial-hero')).toContainText('TECHNET + IMPERIUM');
  await expect(page.locator('.cv-commercial-kpis')).toContainText('Aprovadas');
  await expect(page.locator('.cv-commercial-kpis')).toContainText('Em análise');
  await expect(page.locator('.cv-commercial-sale')).toHaveCount(2);
  await expect(page.locator('.cv-commercial-sale').first()).toContainText('Cliente Imperium');
  await expect(page.locator('.cv-commercial-sale').first()).toContainText('PROP-9988');
  await expect(page.locator('.cv-commercial-sale').first()).toContainText('VIRTUA 600 MEGA');
  await expect(page.locator('.cv-commercial-sale').first()).toContainText('Imperium');
  await expect(page.locator('#cvSalesMonth')).toBeAttached();
  await expect(page.locator('#cvNewSale')).toBeVisible();
});

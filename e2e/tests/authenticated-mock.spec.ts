import { expect, test } from '@playwright/test';
import {
  loginWithMockedAccount,
  type MockRole,
} from './mock-auth';

const ROLE_PAGES: Record<MockRole, string[]> = {
  admin: [
    'dashboard',
    'map',
    'new-sale',
    'backoffice',
    'imperium-products',
    'team',
    'location',
    'territories',
    'command',
    'goals',
    'health',
    'admin',
  ],
  supervisor: ['dashboard', 'map', 'new-sale', 'team', 'location'],
  consultant: ['dashboard', 'map', 'new-sale', 'my-sales'],
  backoffice: ['dashboard', 'map', 'backoffice', 'imperium-products'],
};

for (const [role, expectedPages] of Object.entries(ROLE_PAGES) as [
  MockRole,
  string[],
][]) {
  test(`perfil ${role} recebe somente a navegação permitida`, async ({ page }) => {
    await loginWithMockedAccount(page, role);

    const actualPages = await page.locator('#nav .nav-btn').evaluateAll(buttons =>
      buttons
        .map(button => (button as HTMLElement).dataset.page)
        .filter((pageId): pageId is string => Boolean(pageId)),
    );

    expect(actualPages).toEqual(expectedPages);

    for (const pageId of expectedPages) {
      await expect(
        page.locator(`#nav .nav-btn[data-page="${pageId}"]`),
      ).toHaveCount(1);
    }

    const mobilePages = await page
      .locator('#mobileBottomNav [data-p]')
      .evaluateAll(buttons =>
        buttons
          .map(button => (button as HTMLElement).dataset.p)
          .filter((pageId): pageId is string => Boolean(pageId)),
      );

    expect(mobilePages.length).toBeGreaterThanOrEqual(3);
    expect(mobilePages.length).toBeLessThanOrEqual(5);
    expect(mobilePages.every(pageId => expectedPages.includes(pageId))).toBeTruthy();
  });
}

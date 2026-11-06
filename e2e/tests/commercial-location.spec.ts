import { expect, test } from '@playwright/test';
import { loginWithMockedAccount } from './mock-auth';

for (const role of ['admin', 'supervisor'] as const) {
  test(`perfil ${role} abre a localização da equipe no site principal`, async ({ page }) => {
    await loginWithMockedAccount(page, role);

    const locationNav = page.locator('#nav .nav-btn[data-page="location"]');
    await expect(locationNav).toHaveCount(1);
    await locationNav.evaluate((button: HTMLButtonElement) => button.click());

    await expect(page.locator('#pageTitle')).toHaveText('Localização');
    await expect(page.locator('#commercialLocationRoot')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Localização da equipe' })).toBeVisible();
    await expect(page.locator('#commercialLocationMap')).toBeVisible();
    await expect(page.locator('#locationSearch')).toBeVisible();
    await expect(page.locator('#locationTeam')).toBeVisible();
    await expect(page.locator('#locationSupervisor')).toBeVisible();
    await expect(page.locator('#locationStatus')).toBeVisible();
    await expect(page.locator('#locationUpdatedAt')).toContainText('Atualizado');
  });
}

test('consultor não recebe a visualização gerencial de localização', async ({ page }) => {
  await loginWithMockedAccount(page, 'consultant');
  await expect(page.locator('#nav .nav-btn[data-page="location"]')).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { openPublicLogin } from './helpers';

test.describe('login', () => {
  test('abre a tela real de login com identidade e ações principais', async ({ page }) => {
    await openPublicLogin(page);

    await expect(page).toHaveTitle(/TechNET.*Claro/i);
    await expect(page.locator('#loginView img[alt="Logo TechNET Claro"]:visible').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bem-vindo' })).toBeVisible();
    await expect(page.getByText('Entre com sua conta corporativa e continue sua operação.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Entrar no sistema/i })).toBeVisible();
  });

  test('base, usuário e senha funcionam e possuem labels associados', async ({ page }) => {
    await openPublicLogin(page);

    const base = page.locator('#impBase');
    const user = page.locator('#impUser');
    const password = page.locator('#impPassword');

    await base.selectOption('fortaleza');
    await user.fill('usuario.e2e');
    await password.fill('senha-local-de-teste');

    await expect(base).toHaveValue('fortaleza');
    await expect(user).toHaveValue('usuario.e2e');
    await expect(password).toHaveValue('senha-local-de-teste');

    for (const selector of ['#impBase', '#impUser', '#impPassword']) {
      const labelCount = await page.locator(selector).evaluate(
        element => (element as HTMLInputElement | HTMLSelectElement).labels?.length || 0,
      );
      expect(labelCount, `${selector} deve estar semanticamente associado a um label`).toBeGreaterThan(0);
    }
  });

  test('mostrar e ocultar senha atualiza tipo e nome acessível', async ({ page }) => {
    await openPublicLogin(page);

    const password = page.locator('#impPassword');
    const toggle = page.locator('#passwordToggle');

    await password.fill('senha-local-de-teste');
    await expect(password).toHaveAttribute('type', 'password');
    await expect(toggle).toHaveAttribute('aria-label', 'Mostrar senha');

    await toggle.click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(toggle).toHaveAttribute('aria-label', 'Ocultar senha');

    await toggle.click();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(toggle).toHaveAttribute('aria-label', 'Mostrar senha');
  });

  test('credencial inválida exibe erro útil sem usar conta real', async ({ page }) => {
    await page.route('**/functions/v1/tv-imperium-rest-auth', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Usuário ou senha inválidos.',
          code: 'invalid_credentials',
        }),
      });
    });

    await openPublicLogin(page);
    await page.locator('#impUser').fill('usuario-inexistente-e2e');
    await page.locator('#impPassword').fill('credencial-invalida-e2e');
    await page.getByRole('button', { name: /Entrar no sistema/i }).click();

    await expect(page.locator('#loginMsg')).toContainText('Usuário ou senha inválidos.');
    await expect(page.locator('#loginBtn')).toBeEnabled();
    await expect(page.locator('#loginView')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
  });
});

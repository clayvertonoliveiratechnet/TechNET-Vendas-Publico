import { expect, type Page } from '@playwright/test';

export type MockRole = 'admin' | 'supervisor' | 'consultant' | 'backoffice';

const SUPABASE_ORIGIN = 'https://zpapjeqjpthaxrefrcey.supabase.co';
const MOCK_USER_ID = '00000000-0000-4000-8000-0000000000e2';

function mockJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      aud: 'authenticated',
      exp: now + 3600,
      iat: now,
      sub: MOCK_USER_ID,
      email: 'playwright@technet.local',
      role: 'authenticated',
    }),
  ).toString('base64url');

  return `${header}.${payload}.e2e`;
}

export async function installMockAuthenticatedBackend(
  page: Page,
  role: MockRole,
) {
  const accessToken = mockJwt();
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const user = {
    id: MOCK_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'playwright@technet.local',
    app_metadata: {
      provider: 'email',
      providers: ['email'],
      imperium_base: 'natal',
      imperium_username: 'playwright-e2e',
    },
    user_metadata: {
      full_name: 'Usuário Playwright',
    },
    created_at: new Date().toISOString(),
  };

  await page.route('**/functions/v1/tv-imperium-rest-auth', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        token_hash: 'playwright-token-hash',
      }),
    });
  });

  await page.route(`${SUPABASE_ORIGIN}/auth/v1/verify**`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: expiresAt,
        refresh_token: 'playwright-refresh-token',
        user,
      }),
    });
  });

  await page.route(`${SUPABASE_ORIGIN}/rest/v1/**`, async route => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith('/tv_profiles')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'content-range': '0-0/1',
        },
        body: JSON.stringify({
          user_id: MOCK_USER_ID,
          full_name: 'Usuário Playwright',
          role,
          active: true,
          team_id: role === 'consultant' || role === 'supervisor'
            ? '00000000-0000-4000-8000-000000000101'
            : null,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: url.pathname.includes('/rpc/') ? 'null' : '[]',
    });
  });
}

export async function loginWithMockedAccount(page: Page, role: MockRole) {
  await installMockAuthenticatedBackend(page, role);
  await page.goto('/');

  await expect(page.locator('#authBoot')).toHaveClass(/hidden/, {
    timeout: 15_000,
  });
  await expect(page.locator('#loginView')).toBeVisible();

  await page.locator('#impBase').selectOption('natal');
  await page.locator('#impUser').fill('playwright-e2e');
  await page.locator('#impPassword').fill('senha-nao-real');
  await page.locator('#loginBtn').click();

  await expect(page.locator('#app')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#loginView')).toBeHidden();
  await expect(page.locator('#userMini')).toContainText('Usuário Playwright');
  await expect(page.locator('#nav .nav-btn').first()).toBeAttached();
}

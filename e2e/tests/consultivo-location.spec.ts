import { expect, test } from '@playwright/test';
import { installMockAuthenticatedBackend } from './mock-auth';

test.describe('TECHNET Consultivo GPS nativo', () => {
  test('o site mostra a rota enviada pelo APK sem coletar GPS ou vincular outro aparelho', async ({ page }) => {
    await installMockAuthenticatedBackend(page, 'consultant');
    let binds = 0;
    await page.route('**/functions/v1/tv-consultivo-device', async route => {
      binds += 1;
      await route.fulfill({status:500,body:'{}'});
    });
    await page.route('**/rest/v1/tv_consultivo_positions**', async route => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get('user_id')).toBe('eq.00000000-0000-4000-8000-0000000000e2');
      await route.fulfill({contentType:'application/json',body:JSON.stringify([
        {latitude:-5.79448,longitude:-35.211,accuracy:8,recorded_at:new Date(Date.now()-30000).toISOString()},
        {latitude:-5.795,longitude:-35.212,accuracy:9,recorded_at:new Date().toISOString()},
      ])});
    });
    await page.goto('/consultivo.html');
    await page.locator('#cvImpBase').selectOption('natal');
    await page.locator('#cvImpUser').fill('playwright-e2e');
    await page.locator('#cvImpPassword').fill('senha-nao-real');
    await page.locator('#cvLoginBtn').click();
    await expect(page.locator('[data-gps-status]')).toHaveText('Ativo');
    await page.getByRole('button',{name:/Rastreamento/i}).click();
    await expect(page.locator('#cvGpsAccuracy')).toHaveText('9 m');
    await expect(page.locator('#cvMap .leaflet-overlay-pane path')).toHaveCount(3);
    expect(binds).toBe(0);
  });

  test('o APK fornece a localização e o site somente consome o snapshot', async ({ page }) => {
    await installMockAuthenticatedBackend(page, 'consultant');

    await page.addInitScript(() => {
      const state = window as any;
      state.__browserGpsCalled = false;
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          watchPosition() {
            state.__browserGpsCalled = true;
            throw new Error('browser geolocation must not be used');
          },
        },
      });
      state.TechNETNativeTracking = {
        configure(deviceToken: string, publishableKey: string, paused: boolean) {
          state.__nativeTrackingConfig = { deviceToken, publishableKey, paused };
          return true;
        },
        setPaused(paused: boolean) {
          state.__nativePaused = paused;
        },
        clear() {
          state.__nativeCleared = true;
        },
        snapshot() {
          return JSON.stringify({
            configured: true,
            paused: false,
            last_position: {
              source_id: '11111111-1111-4111-8111-111111111111',
              recorded_at: new Date().toISOString(),
              latitude: -5.79448,
              longitude: -35.211,
              accuracy: 8,
              speed: 1.2,
              heading: 90,
              battery_level: 76,
              activity_type: 'walking',
            },
          });
        },
      };
    });

    let locationRequests = 0;
    await page.route('**/functions/v1/tv-consultivo-device', async route => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(['bind', 'renew']).toContain(body.action);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          device_id: '00000000-0000-4000-8000-000000000777',
          device_token: 'a'.repeat(64),
        }),
      });
    });

    await page.route('**/functions/v1/tv-consultivo-location', async route => {
      locationRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto('/consultivo.html');
    await page.locator('#cvImpBase').selectOption('natal');
    await page.locator('#cvImpUser').fill('playwright-e2e');
    await page.locator('#cvImpPassword').fill('senha-nao-real');
    await page.locator('#cvLoginBtn').click();

    await expect(page.locator('#cvHero')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-gps-status]')).toHaveText('Ativo', {
      timeout: 15_000,
    });

    const nativeConfig = await page.evaluate(() => (window as any).__nativeTrackingConfig);
    expect(nativeConfig.deviceToken).toBe('a'.repeat(64));
    expect(nativeConfig.publishableKey).toMatch(/^sb_/);
    expect(nativeConfig.paused).toBe(false);
    expect(await page.evaluate(() => (window as any).__browserGpsCalled)).toBe(false);
    expect(locationRequests).toBe(0);

    await page.getByRole('button', { name: /Rastreamento/i }).click();
    await expect(page.locator('#cvGpsAccuracy')).toContainText('8 m');
    expect(locationRequests).toBe(0);
  });
});

import { expect, test } from '@playwright/test';
import { installMockAuthenticatedBackend } from './mock-auth';

test('filtros da equipe aplicam status, período e ordenação', async ({ page }) => {
  await installMockAuthenticatedBackend(page, 'supervisor');

  const now = new Date().toISOString();
  const ids = {
    a: '00000000-0000-4000-8000-0000000000a1',
    b: '00000000-0000-4000-8000-0000000000b2',
    c: '00000000-0000-4000-8000-0000000000c3',
  };

  await page.route('**/rest/v1/tv_profiles**', async route => {
    const url = new URL(route.request().url());
    const role = url.searchParams.get('role') || '';
    if (!role.startsWith('in.')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { user_id: ids.a, full_name: 'Ana Consultora', role: 'consultant', team_id: '00000000-0000-4000-8000-000000000101', active: true },
        { user_id: ids.b, full_name: 'Bruna Consultora', role: 'consultant', team_id: '00000000-0000-4000-8000-000000000101', active: true },
        { user_id: ids.c, full_name: 'Carla Consultora', role: 'consultant', team_id: '00000000-0000-4000-8000-000000000101', active: true },
      ]),
    });
  });

  await page.route('**/rest/v1/tv_sales**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { consultant_id: ids.b, commercial_seller_name: 'Bruna Consultora', created_at: now },
        { consultant_id: ids.b, commercial_seller_name: 'Bruna Consultora', created_at: now },
        { consultant_id: ids.a, commercial_seller_name: 'Ana Consultora', created_at: now },
      ]),
    });
  });

  await page.route('**/rest/v1/tv_consultivo_positions**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { user_id: ids.a, latitude: -5.7944, longitude: -35.211, recorded_at: now, battery_level: 88 },
      ]),
    });
  });

  await page.route('**/rest/v1/tv_consultivo_pauses**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ user_id: ids.b, started_at: now, ended_at: null }]),
    });
  });

  await page.route('**/rest/v1/tv_consultivo_daily_summaries**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { user_id: ids.a, distance_meters: 3200, movement_seconds: 1800, stopped_seconds: 600, position_count: 12, last_position_at: now, day: now.slice(0, 10) },
        { user_id: ids.b, distance_meters: 1000, movement_seconds: 300, stopped_seconds: 1200, position_count: 4, last_position_at: now, day: now.slice(0, 10) },
      ]),
    });
  });

  await page.goto('/consultivo.html');
  await page.locator('#cvImpBase').selectOption('natal');
  await page.locator('#cvImpUser').fill('playwright-e2e');
  await page.locator('#cvImpPassword').fill('senha-nao-real');
  await page.locator('#cvLoginBtn').click();

  await page.getByRole('button', { name: 'Equipe', exact: true }).click();
  await expect(page.locator('#cvTeamStatus')).toBeAttached();
  await expect(page.locator('#cvTeamPeriod')).toBeAttached();
  await expect(page.locator('#cvTeamSort')).toBeAttached();
  await expect(page.locator('.cv-team-person')).toHaveCount(3);

  await page.locator('#cvTeamStatus').selectOption('paused');
  await expect(page.locator('.cv-team-person')).toHaveCount(1);
  await expect(page.locator('.cv-team-person')).toContainText('Bruna Consultora');

  await page.locator('#cvTeamStatus').selectOption('all');
  await page.locator('#cvTeamSort').selectOption('name');
  await expect(page.locator('.cv-team-person').first()).toContainText('Ana Consultora');

  await page.locator('#cvTeamPeriod').selectOption('yesterday');
  await expect(page.locator('#cvTeamPeriod')).toHaveValue('yesterday');
  await expect(page.locator('.cv-team-filter').nth(1)).toContainText('Ontem');
  await expect(page.locator('.cv-person-stat.sales').first()).toContainText('Vendas período');
});

test('filtro de período do rastreamento troca rota e métricas históricas', async ({ page }) => {
  await installMockAuthenticatedBackend(page, 'consultant');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(12, 0, 0, 0);
  const yesterdayIso = yesterday.toISOString();
  const yesterdayDay = yesterdayIso.slice(0, 10);
  await page.route('**/rest/v1/tv_consultivo_positions**', async route => {
    const url = new URL(route.request().url());
    const userFilter = url.searchParams.get('user_id') || '';
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(userFilter ? [
      { latitude: -5.7944, longitude: -35.211, accuracy: 9, speed: 1.1, heading: 0, battery_level: 68, recorded_at: yesterdayIso },
      { latitude: -5.7950, longitude: -35.212, accuracy: 11, speed: 1.3, heading: 20, battery_level: 66, recorded_at: new Date(yesterday.getTime()+60000).toISOString() },
    ] : [])});
  });
  await page.route('**/rest/v1/tv_consultivo_daily_summaries**', async route => {
    const url = new URL(route.request().url());
    const dayFilter = url.searchParams.get('day') || '';
    if (dayFilter.startsWith('eq.')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
      return;
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([
      { distance_meters: 1500, movement_seconds: 900, stopped_seconds: 300, position_count: 2, last_position_at: yesterdayIso, day: yesterdayDay },
    ])});
  });
  await page.goto('/consultivo.html');
  await page.locator('#cvImpBase').selectOption('natal');
  await page.locator('#cvImpUser').fill('playwright-e2e');
  await page.locator('#cvImpPassword').fill('senha-nao-real');
  await page.locator('#cvLoginBtn').click();
  await page.getByRole('button', { name: 'Rastreamento', exact: true }).click();
  await expect(page.locator('#cvTrackingPeriod')).toBeAttached();
  await page.locator('#cvTrackingPeriod').selectOption('yesterday');
  await expect(page.locator('#cvTrackingPeriod')).toHaveValue('yesterday');
  await expect(page.locator('.cv-tracking-date')).toContainText('Ontem');
  await expect(page.locator('.cv-tracking-state')).toContainText('Histórico de rastreamento');
  await expect(page.locator('.cv-tracking-metrics')).toContainText('Distância no período');
  await expect(page.locator('.cv-tracking-metrics')).toContainText('1,5 km');
  await expect(page.locator('#cvGpsAccuracy')).toContainText('histórico');
  await expect(page.locator('#cvMap .leaflet-overlay-pane path')).toHaveCount(3);
});


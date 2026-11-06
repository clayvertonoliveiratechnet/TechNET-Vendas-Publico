import { expect, type Page } from '@playwright/test';

export const INTERNAL_PAGES = [
  'dashboard',
  'map',
  'new-sale',
  'my-sales',
  'team',
  'backoffice',
  'imperium-products',
  'territories',
  'command',
  'goals',
  'health',
  'admin',
] as const;

const criticalOrigins = new Set([
  new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173').origin,
  'https://zpapjeqjpthaxrefrcey.supabase.co',
]);

export async function openPublicLogin(page: Page) {
  await page.goto('/');
  await expect(page.locator('#authBoot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await expect(page.locator('#loginView')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
}

export function monitorFrontendHealth(page: Page) {
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];

  page.on('pageerror', error => {
    pageErrors.push(error.message);
  });

  page.on('response', response => {
    const status = response.status();
    if (![500, 502, 503, 504].includes(status)) return;

    try {
      const url = new URL(response.url());
      if (criticalOrigins.has(url.origin)) {
        serverErrors.push(`${status} ${response.request().method()} ${response.url()}`);
      }
    } catch {
      serverErrors.push(`${status} ${response.url()}`);
    }
  });

  return {
    assertClean() {
      expect(pageErrors, 'Erros JavaScript fatais detectados').toEqual([]);
      expect(serverErrors, 'HTTP 5xx críticos detectados').toEqual([]);
    },
  };
}

export async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));

  expect(
    Math.max(dimensions.html, dimensions.body),
    `Overflow horizontal: documento=${Math.max(dimensions.html, dimensions.body)} viewport=${dimensions.viewport}`,
  ).toBeLessThanOrEqual(dimensions.viewport + 1);
}

export async function expectReachableInViewport(page: Page, selector: string) {
  const element = page.locator(selector);
  await expect(element).toBeVisible();
  await element.scrollIntoViewIfNeeded();

  const box = await element.boundingBox();
  expect(box, `${selector} deve possuir área renderizada`).not.toBeNull();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;

  expect(box.width, `${selector} sem largura utilizável`).toBeGreaterThan(1);
  expect(box.height, `${selector} sem altura utilizável`).toBeGreaterThan(1);
  expect(box.x, `${selector} cortado à esquerda`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${selector} cortado à direita`).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height, `${selector} não ficou acessível após rolagem`).toBeLessThanOrEqual(viewport.height + 1);
}

export async function expectApplicationRendered(page: Page) {
  const state = await page.evaluate(() => ({
    bodyText: document.body.innerText.trim(),
    bodyWidth: document.body.getBoundingClientRect().width,
    bodyHeight: document.body.getBoundingClientRect().height,
    loginVisible: !document.querySelector('#loginView')?.classList.contains('hidden'),
    appVisible: !document.querySelector('#app')?.classList.contains('hidden'),
  }));

  expect(state.bodyText.length, 'A aplicação renderizou uma tela em branco').toBeGreaterThan(20);
  expect(state.bodyWidth, 'A aplicação não possui largura renderizada').toBeGreaterThan(100);
  expect(state.bodyHeight, 'A aplicação não possui altura renderizada').toBeGreaterThan(100);
  expect(state.loginVisible || state.appVisible, 'Nenhuma view principal ficou visível').toBeTruthy();
}

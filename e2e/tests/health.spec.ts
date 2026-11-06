import { test } from '@playwright/test';
import {
  expectApplicationRendered,
  monitorFrontendHealth,
  openPublicLogin,
} from './helpers';

test('frontend público renderiza sem pageerror ou HTTP 5xx crítico', async ({ page }) => {
  const health = monitorFrontendHealth(page);

  await openPublicLogin(page);
  await page.waitForTimeout(400);
  await expectApplicationRendered(page);

  health.assertClean();
});

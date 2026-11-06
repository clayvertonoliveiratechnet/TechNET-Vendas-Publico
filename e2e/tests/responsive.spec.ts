import { test } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectReachableInViewport,
  openPublicLogin,
} from './helpers';

test.describe('responsividade do login', () => {
  test('não cria overflow horizontal', async ({ page }) => {
    await openPublicLogin(page);
    await expectNoHorizontalOverflow(page);
  });

  test('controles essenciais continuam visíveis e alcançáveis', async ({ page }) => {
    await openPublicLogin(page);

    for (const selector of ['#impBase', '#impUser', '#impPassword', '#passwordToggle', '#loginBtn']) {
      await expectReachableInViewport(page, selector);
    }
  });
});

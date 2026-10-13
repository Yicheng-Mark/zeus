/**
 * Theme Switching E2E Tests
 *
 * Verifies that selecting modes via the sliding theme capsule
 * updates the `data-theme` attribute on `<html>`.
 */

import { test, expect } from '../../../fixtures';
import { goToSettings } from '../../../helpers/navigation';

test.describe('Theme Switching', () => {
  test.beforeEach(async ({ page }) => {
    await goToSettings(page, 'display');
  });

  test('switches from current theme to the other and back', async ({ page }) => {
    const lightOption = page.getByTestId('theme-option-light');
    const darkOption = page.getByTestId('theme-option-dark');
    await expect(lightOption).toBeVisible();
    await expect(darkOption).toBeVisible();

    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(initialTheme).toBeTruthy();

    const targetTheme = initialTheme === 'light' ? 'dark' : 'light';
    const targetButton = targetTheme === 'dark' ? darkOption : lightOption;
    await targetButton.click();

    await page.waitForFunction(
      (expected) => document.documentElement.getAttribute('data-theme') === expected,
      targetTheme,
      { timeout: 5_000 }
    );

    const newTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(newTheme).toBe(targetTheme);

    const revertButton = initialTheme === 'dark' ? darkOption : lightOption;
    await revertButton.click();

    await page.waitForFunction(
      (expected) => document.documentElement.getAttribute('data-theme') === expected,
      initialTheme,
      { timeout: 5_000 }
    );

    const restoredTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(restoredTheme).toBe(initialTheme);
  });

  test('quick toggle updates its action immediately and can switch back', async ({ page }) => {
    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toBeVisible();

    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const initialLabel = await toggle.getAttribute('aria-label');
    const targetTheme = initialTheme === 'light' ? 'dark' : 'light';

    await toggle.click();
    await page.waitForFunction(
      (expected) => document.documentElement.getAttribute('data-theme') === expected,
      targetTheme,
      { timeout: 5_000 }
    );
    await expect(toggle).not.toHaveAttribute('aria-label', initialLabel ?? '');

    await toggle.click();
    await page.waitForFunction(
      (expected) => document.documentElement.getAttribute('data-theme') === expected,
      initialTheme,
      { timeout: 5_000 }
    );
    await expect(toggle).toHaveAttribute('aria-label', initialLabel ?? '');
  });

  test('dark option sets data-theme to dark', async ({ page }) => {
    const darkOption = page.getByTestId('theme-option-dark');
    await expect(darkOption).toBeVisible();
    await darkOption.click();

    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', {
      timeout: 5_000,
    });

    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');

    const arcoTheme = await page.evaluate(() => document.body.getAttribute('arco-theme'));
    expect(arcoTheme).toBe('dark');
  });

  test('light option sets data-theme to light', async ({ page }) => {
    const lightOption = page.getByTestId('theme-option-light');
    await expect(lightOption).toBeVisible();
    await lightOption.click();

    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light', {
      timeout: 5_000,
    });

    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('light');

    const arcoTheme = await page.evaluate(() => document.body.getAttribute('arco-theme'));
    expect(arcoTheme).toBe('light');
  });

  test('follow-system option keeps a resolvable theme and marks the segment active', async ({ page }) => {
    const systemOption = page.getByTestId('theme-option-system');
    await expect(systemOption).toBeVisible();
    await systemOption.click();

    await page.waitForFunction(() => Boolean(document.documentElement.getAttribute('data-theme')), { timeout: 5_000 });

    await expect(systemOption).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('theme-option-light')).toHaveAttribute('data-active', 'false');

    // Restore to light
    await page.getByTestId('theme-option-light').click();
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light', {
      timeout: 5_000,
    });
  });

  test('capsule segments reflect the active selection', async ({ page }) => {
    const lightOption = page.getByTestId('theme-option-light');
    const darkOption = page.getByTestId('theme-option-dark');
    await lightOption.click();

    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light', {
      timeout: 5_000,
    });

    await expect(lightOption).toHaveAttribute('data-active', 'true');
    await expect(darkOption).toHaveAttribute('data-active', 'false');

    await darkOption.click();

    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', {
      timeout: 5_000,
    });

    await expect(darkOption).toHaveAttribute('data-active', 'true');
    await expect(lightOption).toHaveAttribute('data-active', 'false');

    // Restore to light
    await lightOption.click();
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light', {
      timeout: 5_000,
    });
  });
});

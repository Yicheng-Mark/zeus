/**
 * Dropdown search — E2E coverage for the search boxes added to selection dropdowns.
 *
 * Covers:
 * - Assistant editor: default model / skills / MCP selects become searchable
 *   when their option count exceeds the threshold.
 *
 * The Guid "+" menu skills/MCP submenus were removed with per-conversation
 * skill/MCP selection (agents carry fixed per-mode presets now), so their
 * search coverage was retired with them.
 *
 * The sandboxed E2E environment controls neither the number of skills nor MCP
 * servers, so the test branches on the actual count.
 */
import { test, expect } from '../fixtures';
import { closeAssistantEditor } from '../helpers';

const SEARCH_THRESHOLD = 5;

test.describe('Assistant editor default selects search', () => {
  test.setTimeout(90_000);

  test('default model / skills / mcp selects expose search above the threshold', async ({ page }) => {
    // Assistants live on the standalone `#/assistants` page. Creation was
    // removed with the Zeus three-engine trim, so reach the editor by opening
    // an existing assistant card (defaults selects stay editable there).
    await page.evaluate(() => window.location.assign('#/assistants'));
    const firstCard = page.locator('[data-testid^="assistant-card-"]').first();
    await firstCard.waitFor({ state: 'visible', timeout: 15_000 });
    await firstCard.click();
    await page.locator('[data-testid="input-assistant-name"]').waitFor({ state: 'visible', timeout: 10_000 });

    for (const testId of [
      'select-assistant-default-model',
      'select-assistant-default-skills',
      'select-assistant-default-mcp',
    ]) {
      const select = page.locator(`[data-testid="${testId}"]`);
      if (!(await select.isVisible().catch(() => false))) continue;

      await select.click();
      const options = page.locator('.arco-select-option:visible');
      await options
        .first()
        .waitFor({ state: 'visible', timeout: 5_000 })
        .catch(() => {});
      const optionCount = await options.count();

      // Arco showSearch keeps the trigger's inner input editable when open.
      const searchInput = select.locator('input');
      const isSearchable = await searchInput
        .evaluate((node) => !(node as HTMLInputElement).readOnly)
        .catch(() => false);

      if (optionCount > SEARCH_THRESHOLD + 1) {
        // +1: the hidden/auto option is part of the popup but not of the threshold count.
        expect(isSearchable, `${testId} should be searchable with ${optionCount} options`).toBe(true);
      }
      // Below the threshold we don't assert false: optionCount includes the auto
      // option and (for skills) possibly hidden entries, so it over-counts.

      await page.keyboard.press('Escape');
    }

    await closeAssistantEditor(page);
  });
});

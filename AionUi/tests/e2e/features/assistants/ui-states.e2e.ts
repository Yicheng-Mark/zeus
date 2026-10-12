/**
 * Assistant Settings UI States (P1) — E2E tests aligned with the
 * phase-1 single-list wireframe.
 *
 * Zeus ships a fixed three-engine catalog (no builtin presets, no creation
 * flow), so the official-tag / create / duplicate scenarios were removed
 * with that surface. What remains covers the still-reachable states:
 * extension assistants (when present) and the card → full-page editor flow.
 */
import { test, expect } from '../../fixtures';
import { closeAssistantEditor, goToAssistantSettings, takeScreenshot } from '../../helpers';

test.describe('Assistant Settings UI States (P1)', () => {
  test.setTimeout(90_000);

  test('P1-4: extension assistant switch stays checked and disabled when present', async ({ page }) => {
    await goToAssistantSettings(page);

    const cards = page.locator('[data-testid^="assistant-card-"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    const count = await cards.count();
    let extensionId: string | null = null;
    for (let i = 0; i < count; i++) {
      const cardId = await cards.nth(i).getAttribute('data-testid');
      if (cardId?.includes('ext-')) {
        extensionId = cardId.replace('assistant-card-', '');
        break;
      }
    }

    if (!extensionId) {
      test.skip(true, 'No extension assistant available in this run');
      return;
    }

    const switchElement = page.locator(`[data-testid="switch-enabled-${extensionId}"]`);
    await expect(switchElement).toBeChecked();
    await expect(switchElement).toBeDisabled();
    await takeScreenshot(page, 'assistants/p1-4/01-extension-switch.png');
  });

  test('P1-5: list card opens the full-page editor and back closes it', async ({ page }) => {
    await goToAssistantSettings(page);

    const firstCard = page.locator('[data-testid^="assistant-card-"]').first();
    await firstCard.click();

    const editor = page.locator('[data-testid="assistant-editor-page"]');
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="assistant-editor-bar"]')).toBeVisible();
    await takeScreenshot(page, 'assistants/p1-5/01-editor-opened.png');

    await closeAssistantEditor(page);
    await expect(editor).toBeHidden({ timeout: 5_000 });
    await takeScreenshot(page, 'assistants/p1-5/02-editor-closed.png');
  });
});

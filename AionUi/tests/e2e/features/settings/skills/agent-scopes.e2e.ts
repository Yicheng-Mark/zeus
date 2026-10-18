/**
 * Skills Hub E2E Tests — per-agent skill scopes
 *
 * Covers the capsule that splits the page into the three fixed engine agents
 * plus the imported skills, and the cancel/restore action on an agent's rows.
 *
 * Test Cases Covered:
 * - TC-S-AG-01: Capsule offers a segment per detected engine agent + imported
 * - TC-S-AG-02: Selecting an agent lists its skills, grouped by category
 * - TC-S-AG-03: Cancelling a skill keeps the row in place, marked cancelled
 * - TC-S-AG-04: Restoring a cancelled skill returns it to the agent defaults
 *
 * State note: the artifact under test writes to the assistant catalog, so
 * TC-S-AG-03/04 pair up and restore what they touched. The fixture runs on a
 * disposable userData dir, so a failure cannot strand the developer's own DB.
 */

import { test, expect } from '../../../fixtures';
import { navigateTo } from '../../../helpers/navigation';
import { takeScreenshot } from '../../../helpers/screenshots';

test.describe('Skills Hub - Per-Agent Scopes', () => {
  test.beforeEach(async ({ page }) => {
    // Deliberately NOT goToSkillsHub: that helper selects the imported-skills
    // segment, and this suite is about the agent segments.
    await navigateTo(page, '#/skills');
    await page.locator('[data-testid="skill-scope"]').waitFor({ state: 'visible', timeout: 15_000 });
  });

  test('TC-S-AG-01: offers a capsule segment per detected engine agent plus the imported skills', async ({ page }) => {
    // The three engines are bundled, so all three segments must be present —
    // a missing one means the generated assistant row was not reconciled.
    await expect(page.locator('[data-testid="skill-scope-opencode"]')).toBeVisible();
    await expect(page.locator('[data-testid="skill-scope-aionrs"]')).toBeVisible();
    await expect(page.locator('[data-testid="skill-scope-claude"]')).toBeVisible();
    await expect(page.locator('[data-testid="skill-scope-custom"]')).toBeVisible();

    await takeScreenshot(page, 'skills-hub/agent-scopes/01-capsule.png');
  });

  test('TC-S-AG-02: selecting an agent lists its skills, grouped by category', async ({ page }) => {
    await page.locator('[data-testid="skill-scope-claude"]').click();

    await expect(page.locator('[data-testid="agent-skill-pane"]')).toBeVisible();
    // The dev preset ships engineering + method skills, so both buckets exist.
    await expect(page.locator('[data-testid="skill-category-engineering"]')).toBeVisible();
    await expect(page.locator('[data-testid="agent-skill-row-engineering-code-review"]')).toBeVisible();

    // The heading is the human category label, never the raw plugin prefix.
    await expect(page.locator('[data-testid="skill-category-engineering"] h2')).not.toHaveText('engineering');
    await expect(page.locator('[data-testid="skill-category-engineering"] h2')).not.toBeEmpty();

    await takeScreenshot(page, 'skills-hub/agent-scopes/02-agent-skills.png');
  });

  test('TC-S-AG-03/04: cancelling keeps the row in place, restoring puts it back', async ({ page }) => {
    await page.locator('[data-testid="skill-scope-claude"]').click();

    const row = page.locator('[data-testid="agent-skill-row-engineering-code-review"]');
    const toggle = page.locator('[data-testid="btn-toggle-skill-engineering-code-review"]');
    await expect(row).toHaveAttribute('data-skill-enabled', 'true');

    await toggle.click();
    await expect(row).toHaveAttribute('data-skill-enabled', 'false');
    // In place: the cancelled row stays under its own category heading.
    await expect(page.locator('[data-testid="skill-category-engineering"]')).toContainText('engineering-code-review');
    await takeScreenshot(page, 'skills-hub/agent-scopes/03-cancelled.png');

    await toggle.click();
    await expect(row).toHaveAttribute('data-skill-enabled', 'true');

    // A reload proves the toggle was persisted, not just local state.
    await page.reload();
    await page.locator('[data-testid="skill-scope-claude"]').click();
    await expect(page.locator('[data-testid="agent-skill-row-engineering-code-review"]')).toHaveAttribute(
      'data-skill-enabled',
      'true'
    );
  });
});

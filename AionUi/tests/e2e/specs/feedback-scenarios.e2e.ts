/**
 * Feedback button scenarios — walks each place in the product where the
 * "一键反馈" pill appears, verifies the pill shows up, clicks it, and
 * confirms the feedback modal opens with the correct module preselected.
 *
 * Covered scenarios:
 *   1. About → Bug Report (no module)
 *   3. MCP server connection error → mcp-tools
 *   4. System settings dir-change cancel → system-settings
 *
 * Not covered here (verified via white-box unit tests instead):
 *   - MessageTips error (needs live model)
 *   - MessageToolGroup error (needs live tool call)
 *   - MessageAgentStatus error (needs broken agent session)
 */
import { test, expect, type Page } from '../fixtures';
import { goToSettings } from '../helpers';

// The app can hold several FeedbackReportModal instances (FeedbackProvider's
// plus per-page ones like About's), and Arco keeps closed modals mounted but
// hidden — so always scope to the *visible* body, not the first in the DOM.
const MODAL_BODY = '[data-testid="feedback-report-scroll-body"]';
const VISIBLE_MODAL_BODY = `${MODAL_BODY}:visible`;

/** Close the feedback modal (AionModal sets closable=false so Escape is a no-op). */
async function closeFeedbackModal(page: Page) {
  // The feedback modal is an AionModal (standard variant); its header close
  // button carries aria-label='Close'. Scope to the modal that owns the
  // visible feedback scroll body so we never match another (hidden) instance.
  await page
    .locator('.arco-modal-wrapper', { has: page.locator(VISIBLE_MODAL_BODY) })
    .locator('button[aria-label="Close"]')
    .first()
    .click();
  await expect(page.locator(VISIBLE_MODAL_BODY)).toHaveCount(0, { timeout: 5_000 });
}

// Tests share one Electron instance across spec files; a modal left open by a
// prior (possibly failed) test intercepts pointer events and poisons every
// test after it. Close all visible modals before each test.
test.beforeEach(async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    const closeBtn = page.locator('.arco-modal-wrapper:visible button[aria-label="Close"]').first();
    if (!(await closeBtn.isVisible().catch(() => false))) break;
    await closeBtn.click({ timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: About → Bug Report
// ─────────────────────────────────────────────────────────────────────────────

test('[1] About → Bug Report entry opens feedback modal', async ({ page }) => {
  await goToSettings(page, 'about');

  const bugReportRow = page
    .locator('div')
    .filter({ hasText: /^Report Issue$|^反馈问题$|^問題を報告$|^문제 보고$/ })
    .first();
  await expect(bugReportRow).toBeVisible({ timeout: 10_000 });
  await bugReportRow.click();

  await expect(page.locator(VISIBLE_MODAL_BODY).first()).toBeVisible({ timeout: 5_000 });
  await closeFeedbackModal(page);
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 (MCP error → mcp-tools) is covered by the component-level test
// tests/unit/feedback/McpServerHeaderFeedback.dom.test.tsx — it renders
// McpServerHeader with status='error' and asserts the feedback pill opens
// the modal with module=mcp-tools. Driving a real MCP connection failure
// via the UI proved too brittle (locale-dependent button labels, manual-add
// vs JSON-import dropdown, auto-test timing). The component test gives
// equivalent coverage of the regression-surface.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 (System settings form error) is covered by the static mount-point
// test in tests/unit/feedback/feedbackMountPoints.test.ts — the UI path to
// trigger the error requires mocking Electron's native dialog AND cancelling
// an Arco confirm modal, which is too brittle for a stable E2E. The white-box
// source assertion verifies the module tag stays correct on refactor.
// ─────────────────────────────────────────────────────────────────────────────

// Scenarios 5/6 (custom-agent editor test-connection alerts) were removed with
// the custom-agent editor itself — Zeus ships a fixed agent catalog and no
// longer offers custom-agent creation.

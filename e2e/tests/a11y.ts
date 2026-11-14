import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

// Fails the test on any serious or critical WCAG 2.2 A/AA issue.
export async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    // Map tiles are third-party images with no meaning of their own.
    .exclude('.leaflet-tile-pane')
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join('\n  ')}`);
  expect(serious, `${label}: accessibility issues\n${summary.join('\n')}`).toEqual([]);
}

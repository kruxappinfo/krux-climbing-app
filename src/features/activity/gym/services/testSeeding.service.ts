/**
 * Seeding service: pre-populate a new user with sensible default tests.
 *
 * Strategy:
 *  - On first login, seed 3 pinned tests (the basics) + the rest unpinned.
 *  - User can pin/unpin and reorder later.
 *  - Idempotent: only seeds if the user has zero definitions.
 */

import type { TestRepository } from '../repositories/TestRepository';
import type { TestDefinition, TestTemplateKey } from '../types/test.types';
import { TEST_TEMPLATES, listTemplates } from './testTemplates';

/** Default set of tests pinned on first login. */
const DEFAULT_PINNED: readonly TestTemplateKey[] = [
  'max_hang',
  'min_edge_7s',
  'forty_sec_hang',
];

export async function seedDefaultTestsIfEmpty(repo: TestRepository): Promise<{
  seeded: boolean;
  count: number;
}> {
  const existing = await repo.listDefinitions();
  if (existing.length > 0) return { seeded: false, count: existing.length };

  const pinnedSet = new Set<string>(DEFAULT_PINNED);
  let order = 0;
  const all = listTemplates();

  for (const tpl of all) {
    const pinned = pinnedSet.has(tpl.key);
    const input: Omit<TestDefinition, 'id' | 'enabledAt'> = {
      templateKey: tpl.key,
      name: tpl.name,
      description: tpl.description,
      unit: tpl.unit,
      customUnitLabel: tpl.customUnitLabel,
      progressDirection: tpl.progressDirection,
      requiredContext: tpl.requiredContext,
      pinned,
      order: pinned ? order++ : 1000 + order++,
      defaults: tpl.defaults,
    };
    await repo.createDefinition(input);
  }

  return { seeded: true, count: all.length };
}

/**
 * Create a single test definition from a template (for "Add test" UI).
 * Pinned and placed at the end of the pinned list.
 */
export async function createTestFromTemplate(
  repo: TestRepository,
  templateKey: TestTemplateKey,
  pinned = true
): Promise<TestDefinition> {
  const tpl = TEST_TEMPLATES[templateKey];

  const existing = await repo.listDefinitions();
  const maxPinnedOrder = existing
    .filter((d) => d.pinned)
    .reduce((max, d) => Math.max(max, d.order), -1);
  const maxUnpinnedOrder = existing
    .filter((d) => !d.pinned)
    .reduce((max, d) => Math.max(max, d.order), 999);

  return repo.createDefinition({
    templateKey: tpl.key,
    name: tpl.name,
    description: tpl.description,
    unit: tpl.unit,
    customUnitLabel: tpl.customUnitLabel,
    progressDirection: tpl.progressDirection,
    requiredContext: tpl.requiredContext,
    pinned,
    order: pinned ? maxPinnedOrder + 1 : maxUnpinnedOrder + 1,
    defaults: tpl.defaults,
  });
}

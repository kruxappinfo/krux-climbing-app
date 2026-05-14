/**
 * Unit tests for repository + stats pipeline.
 *
 * Run with: pnpm test (assuming Vitest)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTestRepository } from './InMemoryTestRepository';
import { seedDefaultTestsIfEmpty, createTestFromTemplate } from '../services/testSeeding.service';
import { buildHeaderCards, normalizeDelta, computeTrend } from '../services/testStats.service';

describe('InMemoryTestRepository', () => {
  let repo: InMemoryTestRepository;

  beforeEach(() => {
    repo = new InMemoryTestRepository();
  });

  it('creates and retrieves a definition', async () => {
    const created = await repo.createDefinition({
      templateKey: 'max_hang',
      name: 'Max Hang',
      unit: 'kg',
      progressDirection: 'higher_is_better',
      requiredContext: ['edgeMm', 'bodyWeightKg'],
      pinned: true,
      order: 0,
    });

    expect(created.id).toBeTruthy();
    expect(created.enabledAt).toBeTruthy();

    const fetched = await repo.getDefinition(created.id);
    expect(fetched).toEqual(created);
  });

  it('lists definitions sorted by order', async () => {
    await repo.createDefinition({
      templateKey: 'min_edge_7s', name: 'B', unit: 'mm',
      progressDirection: 'lower_is_better', requiredContext: [], pinned: true, order: 2,
    });
    await repo.createDefinition({
      templateKey: 'max_hang', name: 'A', unit: 'kg',
      progressDirection: 'higher_is_better', requiredContext: [], pinned: true, order: 1,
    });

    const all = await repo.listDefinitions();
    expect(all.map((d) => d.name)).toEqual(['A', 'B']);
  });

  it('filters measurements by testId and date range', async () => {
    const def = await repo.createDefinition({
      templateKey: 'max_hang', name: 'Max', unit: 'kg',
      progressDirection: 'higher_is_better', requiredContext: [], pinned: true, order: 0,
    });

    await repo.createMeasurement({
      testId: def.id, value: 10, measuredAt: '2026-01-01T00:00:00Z', context: {},
    });
    await repo.createMeasurement({
      testId: def.id, value: 12, measuredAt: '2026-03-01T00:00:00Z', context: {},
    });
    await repo.createMeasurement({
      testId: 'other', value: 99, measuredAt: '2026-02-01T00:00:00Z', context: {},
    });

    const filtered = await repo.listMeasurements({
      testId: def.id,
      fromDate: '2026-02-01T00:00:00Z',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].value).toBe(12);
  });

  it('notifies subscribers on changes', async () => {
    let received: number[] = [];
    const unsubscribe = repo.subscribeDefinitions((defs) => {
      received = defs.map((d) => d.order);
    });

    await repo.createDefinition({
      templateKey: 'max_hang', name: 'X', unit: 'kg',
      progressDirection: 'higher_is_better', requiredContext: [], pinned: true, order: 5,
    });

    // Allow microtask to flush
    await Promise.resolve();
    expect(received).toEqual([5]);

    unsubscribe();
  });
});

describe('Seeding', () => {
  it('seeds 10 templates on empty repo with 3 pinned', async () => {
    const repo = new InMemoryTestRepository();
    const { seeded, count } = await seedDefaultTestsIfEmpty(repo);

    expect(seeded).toBe(true);
    expect(count).toBe(10);

    const defs = await repo.listDefinitions();
    const pinned = defs.filter((d) => d.pinned);
    expect(pinned).toHaveLength(3);
    expect(pinned.map((d) => d.templateKey).sort())
      .toEqual(['forty_sec_hang', 'max_hang', 'min_edge_7s']);
  });

  it('is idempotent — does not re-seed', async () => {
    const repo = new InMemoryTestRepository();
    await seedDefaultTestsIfEmpty(repo);
    const second = await seedDefaultTestsIfEmpty(repo);
    expect(second.seeded).toBe(false);
  });

  it('createTestFromTemplate places new pinned test at end of pinned list', async () => {
    const repo = new InMemoryTestRepository();
    await seedDefaultTestsIfEmpty(repo);

    const added = await createTestFromTemplate(repo, 'max_pull_ups', true);
    const all = await repo.listDefinitions();
    const pinned = all.filter((d) => d.pinned);
    expect(pinned[pinned.length - 1].id).toBe(added.id);
  });
});

describe('Stats: normalizeDelta', () => {
  it('higher_is_better: positive raw = positive normalized', () => {
    expect(normalizeDelta(5, 'higher_is_better')).toBe(5);
  });

  it('lower_is_better: negative raw = positive normalized (improvement)', () => {
    expect(normalizeDelta(-2, 'lower_is_better')).toBe(2);
  });
});

describe('Stats: computeTrend', () => {
  it('returns "up" for clearly improving series (higher_is_better)', () => {
    expect(computeTrend([10, 12, 14, 16, 18], 'higher_is_better')).toBe('up');
  });

  it('returns "up" for decreasing series when lower_is_better', () => {
    expect(computeTrend([20, 18, 16, 14], 'lower_is_better')).toBe('up');
  });

  it('returns "flat" for noise-level changes', () => {
    expect(computeTrend([100, 100.1, 99.9, 100.05], 'higher_is_better')).toBe('flat');
  });
});

describe('Stats: buildHeaderCards integration', () => {
  it('produces correct delta and sparkline for pinned tests', async () => {
    const repo = new InMemoryTestRepository();
    const def = await repo.createDefinition({
      templateKey: 'max_hang', name: 'Max Hang', unit: 'kg',
      progressDirection: 'higher_is_better', requiredContext: [],
      pinned: true, order: 0,
    });

    // 3 measurements, progressing
    await repo.createMeasurement({ testId: def.id, value: 10, measuredAt: '2026-01-01T00:00:00Z', context: {} });
    await repo.createMeasurement({ testId: def.id, value: 14, measuredAt: '2026-02-01T00:00:00Z', context: {} });
    await repo.createMeasurement({ testId: def.id, value: 18, measuredAt: '2026-03-01T00:00:00Z', context: {} });

    const defs = await repo.listDefinitions();
    const measures = await repo.listMeasurements({ order: 'asc' });

    const cards = buildHeaderCards(defs, measures, '2026-03-05T00:00:00Z');

    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card.latest?.value).toBe(18);
    expect(card.previous?.value).toBe(14);
    expect(card.delta).toBe(4);                  // +4kg improvement
    expect(card.deltaPercent).toBeCloseTo(28.57, 1);
    expect(card.daysSinceLatest).toBe(4);
    expect(card.sparkline).toEqual([10, 14, 18]);
    expect(card.trend).toBe('up');
  });
});

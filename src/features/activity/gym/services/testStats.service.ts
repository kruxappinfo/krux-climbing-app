/**
 * Pure logic for computing header card state from raw measurements.
 *
 * SHARED CORE. No DOM, no React. 100% testable.
 */

import type {
  TestDefinition,
  TestMeasurement,
  TestHeaderCardState,
  ProgressDirection,
} from '../types/test.types';

const SPARKLINE_POINTS = 8;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Normalize a raw delta so that positive ALWAYS means improvement,
 * regardless of whether the test is "higher is better" or "lower is better".
 */
export function normalizeDelta(rawDelta: number, direction: ProgressDirection): number {
  return direction === 'higher_is_better' ? rawDelta : -rawDelta;
}

/**
 * Compute days between two ISO dates.
 * Returns null if dates are invalid.
 */
export function daysBetween(fromIso: string, toIso: string): number | null {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.floor((to - from) / MS_PER_DAY);
}

/**
 * Compute trend from a series, normalized to improvement.
 * Uses simple linear regression slope sign.
 */
export function computeTrend(
  values: readonly number[],
  direction: ProgressDirection
): 'up' | 'down' | 'flat' {
  if (values.length < 2) return 'flat';

  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * (values[i] - meanY);
    den += dx * dx;
  }

  if (den === 0) return 'flat';
  const slope = num / den;
  const normalized = direction === 'higher_is_better' ? slope : -slope;

  // Threshold to avoid noise being labeled as trend.
  const threshold = Math.abs(meanY) * 0.01;
  if (normalized > threshold) return 'up';
  if (normalized < -threshold) return 'down';
  return 'flat';
}

/**
 * Build the header card state for a single test.
 *
 * @param test           Test definition
 * @param measurements   All measurements for this test (any order)
 * @param now            "Today" reference. Pass new Date().toISOString() in app; injectable for testing.
 */
export function buildHeaderCardState(
  test: TestDefinition,
  measurements: readonly TestMeasurement[],
  now: string = new Date().toISOString()
): TestHeaderCardState {
  // Filter to this test, sort ascending by date.
  const sorted = measurements
    .filter((m) => m.testId === test.id)
    .slice()
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));

  if (sorted.length === 0) {
    return {
      test,
      latest: null,
      previous: null,
      delta: null,
      deltaPercent: null,
      daysSinceLatest: null,
      sparkline: [],
      trend: 'flat',
    };
  }

  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  let delta: number | null = null;
  let deltaPercent: number | null = null;

  if (previous) {
    const raw = latest.value - previous.value;
    delta = normalizeDelta(raw, test.progressDirection);
    if (previous.value !== 0) {
      deltaPercent = (delta / Math.abs(previous.value)) * 100;
    }
  }

  const sparkline = sorted.slice(-SPARKLINE_POINTS).map((m) => m.value);
  const trend = computeTrend(sparkline, test.progressDirection);
  const daysSinceLatest = daysBetween(latest.measuredAt, now);

  return {
    test,
    latest,
    previous,
    delta,
    deltaPercent,
    daysSinceLatest,
    sparkline,
    trend,
  };
}

/**
 * Build header cards for all pinned tests, sorted by user-defined order.
 */
export function buildHeaderCards(
  tests: readonly TestDefinition[],
  measurements: readonly TestMeasurement[],
  now?: string
): TestHeaderCardState[] {
  return tests
    .filter((t) => t.pinned)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((t) => buildHeaderCardState(t, measurements, now));
}

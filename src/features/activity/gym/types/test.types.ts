/**
 * Domain types — Performance Tests (Rocódromo)
 *
 * SHARED CORE. No DOM APIs. UI-agnostic.
 */

/** Direction of progress for a test value. */
export type ProgressDirection = 'higher_is_better' | 'lower_is_better';

/** Measurement unit. Extend as needed. */
export type TestUnit =
  | 'kg'
  | 'mm'
  | 'seconds'
  | 'reps'
  | 'percent_bw' // % bodyweight
  | 'grade'      // climbing grade (e.g. "6b+", "V5")
  | 'custom';

/**
 * Optional context fields that some tests use.
 * Stored on each measurement, NOT on the test definition,
 * so they can vary per measurement (e.g. body weight changes).
 */
export interface TestMeasurementContext {
  /** Edge depth in mm (for hangboard tests) */
  edgeMm?: number;
  /** Body weight at the time of the test, in kg */
  bodyWeightKg?: number;
  /** Free-form notes */
  notes?: string;
  /** Gym where the test was performed */
  gymId?: string;
}

/**
 * A test DEFINITION — what the user wants to measure.
 * Either from the built-in library or user-created.
 */
export interface TestDefinition {
  id: string;
  /** Stable key from library OR 'custom' for user-created */
  templateKey: TestTemplateKey | 'custom';
  /** Display name (i18n key or literal) */
  name: string;
  /** Short description shown in config UI */
  description?: string;
  unit: TestUnit;
  /** For 'custom' unit, allow free-form label */
  customUnitLabel?: string;
  progressDirection: ProgressDirection;
  /** Required context fields the user must fill when logging */
  requiredContext: Array<keyof TestMeasurementContext>;
  /** Whether this test is shown in the header (user pinned) */
  pinned: boolean;
  /** Display order among pinned tests */
  order: number;
  /** ISO date when the user enabled this test */
  enabledAt: string;
  /** Optional reference values (e.g. fixed edge for hangboard) */
  defaults?: Partial<TestMeasurementContext>;
}

/** A single measurement for a given test. */
export interface TestMeasurement {
  id: string;
  testId: string;
  /** Numeric value (or null for grade tests, where we use `gradeValue`) */
  value: number;
  /** For grade-type tests */
  gradeValue?: string;
  measuredAt: string; // ISO date
  context: TestMeasurementContext;
}

/** Aggregated state derived for the header card. */
export interface TestHeaderCardState {
  test: TestDefinition;
  latest: TestMeasurement | null;
  previous: TestMeasurement | null;
  /** Delta vs previous, normalized to progress direction. Positive = improvement. */
  delta: number | null;
  /** Percentage delta vs previous (signed by improvement). */
  deltaPercent: number | null;
  /** Days since latest measurement */
  daysSinceLatest: number | null;
  /** Last N values for sparkline, oldest → newest */
  sparkline: number[];
  /** Trend over the sparkline window: 'up' | 'down' | 'flat' (improvement-normalized) */
  trend: 'up' | 'down' | 'flat';
}

/** Keys of the built-in template library. */
export type TestTemplateKey =
  | 'max_hang'
  | 'min_edge_7s'
  | 'forty_sec_hang'
  | 'repeaters_7_3'
  | 'max_pull_ups'
  | 'weighted_pull_up'
  | 'campus_1_5_9'
  | 'foot_on_campus'
  | 'boulder_test'
  | 'route_test';

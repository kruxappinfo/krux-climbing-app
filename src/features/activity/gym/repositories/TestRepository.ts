/**
 * Repository contract for Test domain persistence.
 *
 * SHARED CORE. Backend-agnostic. The concrete implementation
 * (Firestore, SQLite, in-memory for tests) plugs in here.
 *
 * Rule: this file imports NO backend SDK. Only domain types.
 */

import type { TestDefinition, TestMeasurement } from '../types/test.types';

/** Patch type for partial updates. */
export type TestDefinitionPatch = Partial<
  Omit<TestDefinition, 'id' | 'enabledAt'>
>;

export type TestMeasurementPatch = Partial<
  Omit<TestMeasurement, 'id' | 'testId'>
>;

/** Filter options for listing measurements. */
export interface ListMeasurementsOptions {
  testId?: string;
  fromDate?: string; // ISO inclusive
  toDate?: string;   // ISO inclusive
  limit?: number;
  /** Order by measuredAt. Defaults to 'desc'. */
  order?: 'asc' | 'desc';
}

/** Unsubscribe function returned by subscriptions. */
export type Unsubscribe = () => void;

/**
 * Test repository. All methods are async and return domain objects.
 *
 * Implementations MUST:
 *  - Scope all reads/writes to the authenticated user.
 *  - Generate stable IDs (firestore auto-id or uuid).
 *  - Never leak backend types (DocumentSnapshot, etc.) to callers.
 */
export interface TestRepository {
  // ───────── Test Definitions ─────────

  listDefinitions(): Promise<TestDefinition[]>;

  getDefinition(id: string): Promise<TestDefinition | null>;

  createDefinition(
    input: Omit<TestDefinition, 'id' | 'enabledAt'>
  ): Promise<TestDefinition>;

  updateDefinition(
    id: string,
    patch: TestDefinitionPatch
  ): Promise<void>;

  deleteDefinition(id: string): Promise<void>;

  /** Real-time subscription to all definitions. */
  subscribeDefinitions(
    onChange: (defs: TestDefinition[]) => void,
    onError?: (err: Error) => void
  ): Unsubscribe;

  // ───────── Test Measurements ─────────

  listMeasurements(
    options?: ListMeasurementsOptions
  ): Promise<TestMeasurement[]>;

  getMeasurement(id: string): Promise<TestMeasurement | null>;

  createMeasurement(
    input: Omit<TestMeasurement, 'id'>
  ): Promise<TestMeasurement>;

  updateMeasurement(
    id: string,
    patch: TestMeasurementPatch
  ): Promise<void>;

  deleteMeasurement(id: string): Promise<void>;

  /** Real-time subscription to measurements (optionally filtered by test). */
  subscribeMeasurements(
    onChange: (measurements: TestMeasurement[]) => void,
    options?: ListMeasurementsOptions,
    onError?: (err: Error) => void
  ): Unsubscribe;
}

/**
 * In-memory implementation of TestRepository.
 *
 * Used for unit tests and local development without Firebase.
 * Mirrors Firestore semantics where it matters (filtering, ordering)
 * but keeps everything synchronous-by-microtask.
 */

import type {
  TestRepository,
  TestDefinitionPatch,
  TestMeasurementPatch,
  ListMeasurementsOptions,
  Unsubscribe,
} from './TestRepository';
import type { TestDefinition, TestMeasurement } from '../types/test.types';

type DefListener = (defs: TestDefinition[]) => void;
type MeasureListener = (ms: TestMeasurement[]) => void;

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

export class InMemoryTestRepository implements TestRepository {
  private definitions = new Map<string, TestDefinition>();
  private measurements = new Map<string, TestMeasurement>();
  private defListeners = new Set<DefListener>();
  private measureListeners = new Set<
    { fn: MeasureListener; options: ListMeasurementsOptions }
  >();

  // ───────── Definitions ─────────

  async listDefinitions(): Promise<TestDefinition[]> {
    return [...this.definitions.values()].sort((a, b) => a.order - b.order);
  }

  async getDefinition(id: string): Promise<TestDefinition | null> {
    return this.definitions.get(id) ?? null;
  }

  async createDefinition(
    input: Omit<TestDefinition, 'id' | 'enabledAt'>
  ): Promise<TestDefinition> {
    const full: TestDefinition = {
      ...input,
      id: nextId('def'),
      enabledAt: new Date().toISOString(),
    };
    this.definitions.set(full.id, full);
    this.emitDefs();
    return full;
  }

  async updateDefinition(id: string, patch: TestDefinitionPatch): Promise<void> {
    const current = this.definitions.get(id);
    if (!current) throw new Error(`Definition ${id} not found`);
    this.definitions.set(id, { ...current, ...patch });
    this.emitDefs();
  }

  async deleteDefinition(id: string): Promise<void> {
    this.definitions.delete(id);
    this.emitDefs();
  }

  subscribeDefinitions(onChange: DefListener): Unsubscribe {
    this.defListeners.add(onChange);
    // Emit current state asynchronously to mimic Firestore.
    queueMicrotask(() => onChange([...this.definitions.values()].sort((a, b) => a.order - b.order)));
    return () => this.defListeners.delete(onChange);
  }

  // ───────── Measurements ─────────

  async listMeasurements(options: ListMeasurementsOptions = {}): Promise<TestMeasurement[]> {
    return this.applyFilter([...this.measurements.values()], options);
  }

  async getMeasurement(id: string): Promise<TestMeasurement | null> {
    return this.measurements.get(id) ?? null;
  }

  async createMeasurement(
    input: Omit<TestMeasurement, 'id'>
  ): Promise<TestMeasurement> {
    const full: TestMeasurement = { ...input, id: nextId('meas') };
    this.measurements.set(full.id, full);
    this.emitMeasures();
    return full;
  }

  async updateMeasurement(id: string, patch: TestMeasurementPatch): Promise<void> {
    const current = this.measurements.get(id);
    if (!current) throw new Error(`Measurement ${id} not found`);
    this.measurements.set(id, { ...current, ...patch });
    this.emitMeasures();
  }

  async deleteMeasurement(id: string): Promise<void> {
    this.measurements.delete(id);
    this.emitMeasures();
  }

  subscribeMeasurements(
    onChange: MeasureListener,
    options: ListMeasurementsOptions = {}
  ): Unsubscribe {
    const entry = { fn: onChange, options };
    this.measureListeners.add(entry);
    queueMicrotask(() =>
      onChange(this.applyFilter([...this.measurements.values()], options))
    );
    return () => this.measureListeners.delete(entry);
  }

  // ───────── Helpers ─────────

  private applyFilter(
    all: TestMeasurement[],
    options: ListMeasurementsOptions
  ): TestMeasurement[] {
    let out = all;
    if (options.testId) out = out.filter((m) => m.testId === options.testId);
    if (options.fromDate) out = out.filter((m) => m.measuredAt >= options.fromDate!);
    if (options.toDate) out = out.filter((m) => m.measuredAt <= options.toDate!);
    out.sort((a, b) =>
      options.order === 'asc'
        ? a.measuredAt.localeCompare(b.measuredAt)
        : b.measuredAt.localeCompare(a.measuredAt)
    );
    if (options.limit) out = out.slice(0, options.limit);
    return out;
  }

  private emitDefs(): void {
    const snapshot = [...this.definitions.values()].sort((a, b) => a.order - b.order);
    this.defListeners.forEach((fn) => fn(snapshot));
  }

  private emitMeasures(): void {
    const all = [...this.measurements.values()];
    this.measureListeners.forEach(({ fn, options }) => fn(this.applyFilter(all, options)));
  }

  /** Test-only helper. */
  _reset(): void {
    this.definitions.clear();
    this.measurements.clear();
    this.defListeners.clear();
    this.measureListeners.clear();
  }
}

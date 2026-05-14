/**
 * Firestore implementation of TestRepository.
 *
 * Path layout:
 *   users/{userId}/test_definitions/{testId}
 *   users/{userId}/test_measurements/{measurementId}
 *
 * Notes:
 *  - Uses FirestoreDataConverter for type safety at the boundary.
 *  - All Date values stored as Timestamps (Firestore-native, sortable, indexable).
 *  - Domain layer uses ISO strings; conversion happens here only.
 *  - Persistence is enabled by the caller via enableIndexedDbPersistence (web)
 *    or it's automatic on RN/Capacitor with the right SDK init.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fbLimit,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  type Firestore,
  type FirestoreDataConverter,
  type QueryConstraint,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import type {
  TestRepository,
  TestDefinitionPatch,
  TestMeasurementPatch,
  ListMeasurementsOptions,
  Unsubscribe,
} from './TestRepository';

import type {
  TestDefinition,
  TestMeasurement,
  TestUnit,
  ProgressDirection,
  TestTemplateKey,
  TestMeasurementContext,
} from '../types/test.types';

// ──────────────────────────────────────────────────────────────────────
// Converters: domain ↔ Firestore
// ──────────────────────────────────────────────────────────────────────

/**
 * Domain uses ISO strings (serializable, framework-agnostic).
 * Firestore prefers Timestamps (sortable, indexable, smaller).
 * Convert here and nowhere else.
 */
function tsToIso(ts: Timestamp | undefined | null): string {
  if (!ts) return new Date().toISOString();
  return ts.toDate().toISOString();
}

function isoToTs(iso: string): Timestamp {
  return Timestamp.fromDate(new Date(iso));
}

const definitionConverter: FirestoreDataConverter<TestDefinition> = {
  toFirestore(def): DocumentData {
    return {
      templateKey: def.templateKey,
      name: def.name,
      description: def.description ?? null,
      unit: def.unit,
      customUnitLabel: def.customUnitLabel ?? null,
      progressDirection: def.progressDirection,
      requiredContext: def.requiredContext,
      pinned: def.pinned,
      order: def.order,
      enabledAt: isoToTs(def.enabledAt as string),
      defaults: def.defaults ?? null,
    };
  },
  fromFirestore(snap: QueryDocumentSnapshot): TestDefinition {
    const d = snap.data();
    return {
      id: snap.id,
      templateKey: d.templateKey as TestTemplateKey | 'custom',
      name: d.name as string,
      description: (d.description as string | null) ?? undefined,
      unit: d.unit as TestUnit,
      customUnitLabel: (d.customUnitLabel as string | null) ?? undefined,
      progressDirection: d.progressDirection as ProgressDirection,
      requiredContext: (d.requiredContext as Array<keyof TestMeasurementContext>) ?? [],
      pinned: Boolean(d.pinned),
      order: Number(d.order ?? 0),
      enabledAt: tsToIso(d.enabledAt as Timestamp),
      defaults: (d.defaults as Partial<TestMeasurementContext> | null) ?? undefined,
    };
  },
};

const measurementConverter: FirestoreDataConverter<TestMeasurement> = {
  toFirestore(m): DocumentData {
    return {
      testId: m.testId,
      value: m.value,
      gradeValue: m.gradeValue ?? null,
      measuredAt: isoToTs(m.measuredAt as string),
      context: m.context ?? {},
    };
  },
  fromFirestore(snap: QueryDocumentSnapshot): TestMeasurement {
    const d = snap.data();
    return {
      id: snap.id,
      testId: d.testId as string,
      value: Number(d.value),
      gradeValue: (d.gradeValue as string | null) ?? undefined,
      measuredAt: tsToIso(d.measuredAt as Timestamp),
      context: (d.context as TestMeasurementContext) ?? {},
    };
  },
};

// ──────────────────────────────────────────────────────────────────────
// Repository implementation
// ──────────────────────────────────────────────────────────────────────

export interface FirestoreTestRepositoryDeps {
  db: Firestore;
  /** Function that returns the current authenticated user's UID. */
  getUserId: () => string | null;
}

export class FirestoreTestRepository implements TestRepository {
  constructor(private readonly deps: FirestoreTestRepositoryDeps) {}

  private requireUserId(): string {
    const uid = this.deps.getUserId();
    if (!uid) {
      throw new Error('TestRepository: no authenticated user. Sign in before accessing test data.');
    }
    return uid;
  }

  private defsCol(uid: string) {
    return collection(this.deps.db, 'users', uid, 'test_definitions').withConverter(definitionConverter);
  }

  private measuresCol(uid: string) {
    return collection(this.deps.db, 'users', uid, 'test_measurements').withConverter(measurementConverter);
  }

  // ───────── Definitions ─────────

  async listDefinitions(): Promise<TestDefinition[]> {
    const uid = this.requireUserId();
    const snap = await getDocs(query(this.defsCol(uid), orderBy('order', 'asc')));
    return snap.docs.map((d) => d.data());
  }

  async getDefinition(id: string): Promise<TestDefinition | null> {
    const uid = this.requireUserId();
    const ref = doc(this.deps.db, 'users', uid, 'test_definitions', id).withConverter(definitionConverter);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  }

  async createDefinition(
    input: Omit<TestDefinition, 'id' | 'enabledAt'>
  ): Promise<TestDefinition> {
    const uid = this.requireUserId();
    const ref = doc(this.defsCol(uid));
    const enabledAt = new Date().toISOString();
    const full: TestDefinition = { ...input, id: ref.id, enabledAt };
    await setDoc(ref, full);
    return full;
  }

  async updateDefinition(id: string, patch: TestDefinitionPatch): Promise<void> {
    const uid = this.requireUserId();
    const ref = doc(this.deps.db, 'users', uid, 'test_definitions', id);
    // Strip undefined; Firestore rejects them.
    const clean = stripUndefined(patch);
    await updateDoc(ref, { ...clean, updatedAt: serverTimestamp() });
  }

  async deleteDefinition(id: string): Promise<void> {
    const uid = this.requireUserId();
    // NOTE: this does NOT cascade-delete measurements.
    // Caller decides whether to keep historical data or purge.
    await deleteDoc(doc(this.deps.db, 'users', uid, 'test_definitions', id));
  }

  subscribeDefinitions(
    onChange: (defs: TestDefinition[]) => void,
    onError?: (err: Error) => void
  ): Unsubscribe {
    const uid = this.requireUserId();
    return onSnapshot(
      query(this.defsCol(uid), orderBy('order', 'asc')),
      (snap) => onChange(snap.docs.map((d) => d.data())),
      (err) => onError?.(err)
    );
  }

  // ───────── Measurements ─────────

  async listMeasurements(options: ListMeasurementsOptions = {}): Promise<TestMeasurement[]> {
    const uid = this.requireUserId();
    const snap = await getDocs(query(this.measuresCol(uid), ...buildMeasurementConstraints(options)));
    return snap.docs.map((d) => d.data());
  }

  async getMeasurement(id: string): Promise<TestMeasurement | null> {
    const uid = this.requireUserId();
    const ref = doc(this.deps.db, 'users', uid, 'test_measurements', id).withConverter(measurementConverter);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  }

  async createMeasurement(
    input: Omit<TestMeasurement, 'id'>
  ): Promise<TestMeasurement> {
    const uid = this.requireUserId();
    const ref = doc(this.measuresCol(uid));
    const full: TestMeasurement = { ...input, id: ref.id };
    await setDoc(ref, full);
    return full;
  }

  async updateMeasurement(id: string, patch: TestMeasurementPatch): Promise<void> {
    const uid = this.requireUserId();
    const ref = doc(this.deps.db, 'users', uid, 'test_measurements', id);
    const clean = stripUndefined(patch);
    // If measuredAt is in the patch as ISO string, convert it.
    if (typeof clean.measuredAt === 'string') {
      (clean as Record<string, unknown>).measuredAt = isoToTs(clean.measuredAt);
    }
    await updateDoc(ref, clean);
  }

  async deleteMeasurement(id: string): Promise<void> {
    const uid = this.requireUserId();
    await deleteDoc(doc(this.deps.db, 'users', uid, 'test_measurements', id));
  }

  subscribeMeasurements(
    onChange: (measurements: TestMeasurement[]) => void,
    options: ListMeasurementsOptions = {},
    onError?: (err: Error) => void
  ): Unsubscribe {
    const uid = this.requireUserId();
    return onSnapshot(
      query(this.measuresCol(uid), ...buildMeasurementConstraints(options)),
      (snap) => onChange(snap.docs.map((d) => d.data())),
      (err) => onError?.(err)
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function buildMeasurementConstraints(options: ListMeasurementsOptions): QueryConstraint[] {
  const constraints: QueryConstraint[] = [];

  if (options.testId) {
    constraints.push(where('testId', '==', options.testId));
  }
  if (options.fromDate) {
    constraints.push(where('measuredAt', '>=', isoToTs(options.fromDate)));
  }
  if (options.toDate) {
    constraints.push(where('measuredAt', '<=', isoToTs(options.toDate)));
  }

  constraints.push(orderBy('measuredAt', options.order ?? 'desc'));

  if (options.limit && options.limit > 0) {
    constraints.push(fbLimit(options.limit));
  }
  return constraints;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

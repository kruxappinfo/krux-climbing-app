/**
 * Formatting helpers for test values.
 *
 * SHARED CORE. Pure. No DOM, no Intl side effects.
 * Uses Intl.NumberFormat which is available in both Web and React Native.
 */

import type { TestUnit, TestMeasurement, TestDefinition } from '../types/test.types';

const numberFormatter = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 1,
});

const signedFormatter = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 1,
  signDisplay: 'always',
});

/** Format the main value displayed on a card. */
export function formatTestValue(
  measurement: TestMeasurement | null,
  test: TestDefinition
): string {
  if (!measurement) return '—';

  if (test.unit === 'grade' && measurement.gradeValue) {
    return measurement.gradeValue;
  }

  const label = unitLabel(test);
  // kg can be signed (positive lastre, negative = bodyweight only)
  const formatted = numberFormatter.format(measurement.value);
  return label ? `${formatted} ${label}` : formatted;
}

/** Format the delta line. Already normalized (positive = improvement). */
export function formatDelta(
  delta: number | null,
  test: TestDefinition
): { text: string; sign: 'positive' | 'negative' | 'neutral' } {
  if (delta === null) return { text: 'Sin comparativa', sign: 'neutral' };
  if (delta === 0) return { text: '= sin cambios', sign: 'neutral' };

  const label = unitLabel(test);
  const sign = delta > 0 ? 'positive' : 'negative';
  const formatted = signedFormatter.format(delta);
  return {
    text: label ? `${formatted} ${label}` : formatted,
    sign,
  };
}

/** Format days since last measurement. */
export function formatDaysAgo(days: number | null): string {
  if (days === null) return '';
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days}d`;
  if (days < 365) return `hace ${Math.floor(days / 30)}m`;
  return `hace ${Math.floor(days / 365)}a`;
}

/** Resolve a human-readable unit label. */
export function unitLabel(test: TestDefinition): string {
  switch (test.unit) {
    case 'kg': return 'kg';
    case 'mm': return 'mm';
    case 'seconds': return 's';
    case 'reps': return 'reps';
    case 'percent_bw': return '% PC';
    case 'grade': return '';
    case 'custom': return test.customUnitLabel ?? '';
  }
}

const _exhaustiveUnit: TestUnit = 'kg'; // compile-time guard
void _exhaustiveUnit;

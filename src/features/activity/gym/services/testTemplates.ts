/**
 * Built-in library of test templates.
 *
 * Based on widely-used protocols (Lattice, Eva López, Beastmaker).
 * Users can pin/unpin and edit. Custom tests can also be created.
 *
 * SHARED CORE. Pure data, no side effects.
 */

import type { TestTemplateKey, TestUnit, ProgressDirection, TestMeasurementContext } from '../types/test.types';

export interface TestTemplate {
  key: TestTemplateKey;
  name: string;
  shortName: string;
  description: string;
  category: 'finger_strength' | 'endurance' | 'pulling' | 'power' | 'climbing_level';
  unit: TestUnit;
  customUnitLabel?: string;
  progressDirection: ProgressDirection;
  requiredContext: Array<keyof TestMeasurementContext>;
  defaults?: Partial<TestMeasurementContext>;
  /** Protocol description shown in the "how to" modal */
  protocol: string[];
}

export const TEST_TEMPLATES: Readonly<Record<TestTemplateKey, TestTemplate>> = {
  max_hang: {
    key: 'max_hang',
    name: 'Max Hangs',
    shortName: 'Max Hang',
    description: 'Fuerza máxima de dedos en regleta de referencia.',
    category: 'finger_strength',
    unit: 'kg',
    progressDirection: 'higher_is_better',
    requiredContext: ['edgeMm', 'bodyWeightKg'],
    defaults: { edgeMm: 20 },
    protocol: [
      'Calienta 15-20 min progresivamente.',
      'Cuelga 7s en regleta de 20mm con lastre.',
      'Sube lastre hasta no aguantar 7s con técnica limpia.',
      'Descanso 3-5 min entre intentos.',
      'Registra el máximo lastre aguantado.',
    ],
  },
  min_edge_7s: {
    key: 'min_edge_7s',
    name: 'Regleta mínima 7s',
    shortName: 'Min Edge',
    description: 'Regleta más pequeña en la que aguantas 7s a peso corporal.',
    category: 'finger_strength',
    unit: 'mm',
    progressDirection: 'lower_is_better',
    requiredContext: ['bodyWeightKg'],
    protocol: [
      'Calienta progresivamente.',
      'Empieza en una regleta cómoda (15-20mm).',
      'Reduce 1-2mm por intento hasta no aguantar 7s.',
      'Descanso 3-5 min entre intentos.',
      'Registra la mínima regleta limpia.',
    ],
  },
  forty_sec_hang: {
    key: 'forty_sec_hang',
    name: '40s en regleta',
    shortName: '40s Hang',
    description: 'Regleta más pequeña en la que aguantas 40s a peso corporal.',
    category: 'endurance',
    unit: 'mm',
    progressDirection: 'lower_is_better',
    requiredContext: ['bodyWeightKg'],
    protocol: [
      'Calienta progresivamente.',
      'Cuelga 40s continuos sin soltar.',
      'Si lo aguantas, prueba regleta más pequeña en otra sesión.',
      'Registra la mínima regleta soportada 40s.',
    ],
  },
  repeaters_7_3: {
    key: 'repeaters_7_3',
    name: 'Repeaters 7/3',
    shortName: 'Repeaters',
    description: 'Resistencia de fuerza: 7s colgar / 3s descanso hasta fallo.',
    category: 'endurance',
    unit: 'reps',
    progressDirection: 'higher_is_better',
    requiredContext: ['edgeMm', 'bodyWeightKg'],
    defaults: { edgeMm: 20 },
    protocol: [
      'Regleta de referencia (20mm).',
      '7s colgado, 3s descanso. Repetir hasta fallo.',
      'Registra número de ciclos completados.',
    ],
  },
  max_pull_ups: {
    key: 'max_pull_ups',
    name: 'Dominadas máximas',
    shortName: 'Pull-ups',
    description: 'Dominadas consecutivas sin parar.',
    category: 'pulling',
    unit: 'reps',
    progressDirection: 'higher_is_better',
    requiredContext: [],
    protocol: [
      'Agarre prono, anchura de hombros.',
      'Pecho a barra o barbilla por encima.',
      'Sin balanceo, hasta fallo técnico.',
    ],
  },
  weighted_pull_up: {
    key: 'weighted_pull_up',
    name: 'Dominada con lastre',
    shortName: 'Pull-up +kg',
    description: 'Carga máxima en 1 dominada limpia.',
    category: 'pulling',
    unit: 'kg',
    progressDirection: 'higher_is_better',
    requiredContext: ['bodyWeightKg'],
    protocol: [
      'Calienta con dominadas progresivas.',
      'Sube lastre hasta máximo para 1 rep limpia.',
      'Descanso 3-5 min entre intentos.',
    ],
  },
  campus_1_5_9: {
    key: 'campus_1_5_9',
    name: 'Campus 1-5-9',
    shortName: 'Campus',
    description: 'Test de potencia de contacto: saltos en campus board.',
    category: 'power',
    unit: 'custom',
    customUnitLabel: 'combinación máx.',
    progressDirection: 'higher_is_better',
    requiredContext: [],
    protocol: [
      'Calienta muy bien hombros y dedos.',
      'Listón 1 → 5 → 9 (o tu mejor combinación).',
      'Registra la mejor combinación limpia.',
    ],
  },
  foot_on_campus: {
    key: 'foot_on_campus',
    name: 'Foot-on campus',
    shortName: 'Foot Campus',
    description: 'Potencia controlada con pies.',
    category: 'power',
    unit: 'custom',
    customUnitLabel: 'combinación',
    progressDirection: 'higher_is_better',
    requiredContext: [],
    protocol: [
      'Pies en pie fijo del campus.',
      'Manos en movimientos progresivos.',
      'Registra mejor secuencia limpia.',
    ],
  },
  boulder_test: {
    key: 'boulder_test',
    name: 'Test de bloque',
    shortName: 'Bloque',
    description: 'Grado de bloque consolidado en sesión.',
    category: 'climbing_level',
    unit: 'grade',
    progressDirection: 'higher_is_better',
    requiredContext: ['gymId'],
    protocol: [
      'Define 5 bloques de referencia en tu gym.',
      'Registra el grado máximo encadenado en ≤3 intentos.',
    ],
  },
  route_test: {
    key: 'route_test',
    name: 'Test de vía',
    shortName: 'Vía',
    description: 'Grado de vía consolidado a vista o flash.',
    category: 'climbing_level',
    unit: 'grade',
    progressDirection: 'higher_is_better',
    requiredContext: ['gymId'],
    protocol: [
      'Vías que no conoces previamente.',
      'Registra grado máximo a vista en la sesión.',
    ],
  },
};

/** Helper: get template by key safely. */
export function getTemplate(key: TestTemplateKey): TestTemplate {
  return TEST_TEMPLATES[key];
}

/** Helper: list all templates as array. */
export function listTemplates(): readonly TestTemplate[] {
  return Object.values(TEST_TEMPLATES);
}

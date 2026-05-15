import React from 'react';
import type { CSSProperties } from 'react';
import type { TestRepository } from '../repositories/TestRepository';
import type { TestHeaderCardState } from '../types/test.types';
import { useTestHeader } from '../hooks/useTestHeader';
import { formatDelta, formatDaysAgo, unitLabel } from '../services/formatTest';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GYM_COLOR = '#534AB7';

// ─────────────────────────────────────────────────────────────────────────────
// Sparkline — matches mockup (no fill, 26px height, viewBox 120×28)
// ─────────────────────────────────────────────────────────────────────────────

function Sparkline({ values }: { values: readonly number[] }) {
  if (values.length < 2) return <div style={{ height: 26 }} />;

  const VW = 120, VH = 28, PAD = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const pts = values
    .map((v, i) => {
      const x = PAD + (i / (values.length - 1)) * (VW - PAD * 2);
      const y = VH - PAD - ((v - min) / range) * (VH - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const lastV = values[values.length - 1];
  const dotY = VH - PAD - ((lastV - min) / range) * (VH - PAD * 2);

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', height: 26 }} aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={GYM_COLOR}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={(VW - PAD).toFixed(1)} cy={dotY.toFixed(1)} r="2.2" fill={GYM_COLOR} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Short context label shown top-right of each card (e.g. "20mm", "a PC"). */
function contextLabel(state: TestHeaderCardState): string {
  const { test } = state;
  if (test.defaults?.edgeMm) return `${test.defaults.edgeMm}mm`;
  if (test.requiredContext.includes('bodyWeightKg')) return 'a PC';
  return '';
}

/** Split formatted value into {num, unit} for the two-size display. */
function splitValue(state: TestHeaderCardState): { num: string; unit: string } {
  const { test, latest } = state;
  if (!latest) return { num: '—', unit: '' };
  if (test.unit === 'grade') return { num: latest.gradeValue ?? String(latest.value), unit: '' };

  const formatted = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(latest.value);
  return { num: formatted, unit: unitLabel(test) };
}

/** Delta arrow + text for the badge. */
function deltaDisplay(state: TestHeaderCardState): {
  arrow: '↑' | '↓' | '=';
  text: string;
  sign: 'positive' | 'negative' | 'neutral';
} {
  const { delta, test } = state;
  if (delta === null) return { arrow: '=', text: 'Sin datos', sign: 'neutral' };
  if (delta === 0) return { arrow: '=', text: `0 ${unitLabel(test)}`, sign: 'neutral' };

  const d = formatDelta(delta, test);
  return {
    arrow: delta > 0 ? '↑' : '↓',
    text: d.text,
    sign: d.sign,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton card
// ─────────────────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div style={s.card} aria-hidden>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ ...s.bone, width: 56, height: 10 }} />
        <div style={{ ...s.bone, width: 24, height: 10 }} />
      </div>
      <div style={{ ...s.bone, width: 70, height: 28, marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <div style={{ ...s.bone, width: 52, height: 18 }} />
        <div style={{ ...s.bone, width: 38, height: 18 }} />
      </div>
      <div style={{ ...s.bone, width: '100%', height: 26 }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single card
// ─────────────────────────────────────────────────────────────────────────────

function TestCard({
  state,
  onClick,
}: {
  state: TestHeaderCardState;
  onClick: (testId: string) => void;
}) {
  const { num, unit } = splitValue(state);
  const { arrow, text: deltaText, sign } = deltaDisplay(state);
  const ctx = contextLabel(state);

  const badgeStyle: CSSProperties = {
    ...s.badge,
    background: sign === 'positive' ? '#E1F5EE' : sign === 'negative' ? '#fee2e2' : 'var(--bg-secondary)',
    color:      sign === 'positive' ? '#0F6E56' : sign === 'negative' ? '#dc2626' : 'var(--text-secondary)',
  };

  return (
    <article
      style={s.card}
      role="button"
      tabIndex={0}
      aria-label={`Test ${state.test.name}: ${num} ${unit}`}
      onClick={() => onClick(state.test.id)}
      onKeyDown={(e) => e.key === 'Enter' && onClick(state.test.id)}
    >
      {/* Row 1: name + context */}
      <div style={s.cardTop}>
        <span style={s.cardName}>{state.test.name.toUpperCase()}</span>
        {ctx && <span style={s.cardCtx}>{ctx}</span>}
      </div>

      {/* Row 2: value */}
      <div style={s.cardValue}>
        {num}
        {unit && <span style={s.cardUnit}> {unit}</span>}
      </div>

      {/* Row 3: delta badge + days */}
      <div style={s.cardMeta}>
        <span style={badgeStyle}>{arrow} {deltaText}</span>
        <span style={s.cardDays}>{formatDaysAgo(state.daysSinceLatest)}</span>
      </div>

      {/* Sparkline */}
      <Sparkline values={state.sparkline} />
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add-test card
// ─────────────────────────────────────────────────────────────────────────────

function AddCard({ onAdd }: { onAdd?: () => void }) {
  return (
    <button
      style={s.addCard}
      onClick={onAdd}
      aria-label="Añadir test al header"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      <span style={s.addCardLabel}>Añadir test<br />al header</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TestHeader
// ─────────────────────────────────────────────────────────────────────────────

export type GymTab = 'roca' | 'rocodromo';

export interface TestHeaderProps {
  repo: TestRepository;
  activeTab?: GymTab;
  onTabChange?: (tab: GymTab) => void;
  onConfigureTests?: () => void;
  onRecordMeasurement?: (testId?: string) => void;
  onAddTest?: () => void;
}

export function TestHeader({
  repo,
  activeTab = 'rocodromo',
  onTabChange,
  onConfigureTests,
  onRecordMeasurement,
  onAddTest,
}: TestHeaderProps) {
  const { cards, loading, error } = useTestHeader(repo);

  return (
    <div style={s.root}>

      {/* ── Toggle Roca / Rocódromo ──────────────────────────── */}
      <div style={s.toggleRow}>
        <div style={s.toggle}>
          <button
            style={activeTab === 'roca' ? s.toggleActive : s.toggleInactive}
            onClick={() => onTabChange?.('roca')}
          >
            Roca
          </button>
          <button
            style={activeTab === 'rocodromo' ? s.toggleActive : s.toggleInactive}
            onClick={() => onTabChange?.('rocodromo')}
          >
            Rocódromo
          </button>
        </div>
      </div>

      {/* ── Section header ───────────────────────────────────── */}
      <div style={s.headerRow}>
        <p style={s.sectionTitle}>TESTS DE RENDIMIENTO</p>
        <button style={s.btnOutline} onClick={onConfigureTests}>
          <IconSettings />
          Configurar tests
        </button>
      </div>

      {/* ── Error ────────────────────────────────────────────── */}
      {error && (
        <div style={s.error} role="alert">
          No se pudieron cargar los tests: {error.message}
        </div>
      )}

      {/* ── Grid ─────────────────────────────────────────────── */}
      <div style={s.grid}>
        {loading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            {cards.map((state) => (
              <TestCard
                key={state.test.id}
                state={state}
                onClick={(id) => onRecordMeasurement?.(id)}
              />
            ))}
            <AddCard onAdd={onAddTest ?? onConfigureTests} />
          </>
        )}
      </div>

      {/* ── CTA bottom ───────────────────────────────────────── */}
      <button
        style={s.btnRegister}
        onClick={() => onRecordMeasurement?.()}
        disabled={loading}
      >
        <IconPlus />
        Registrar nueva medición
      </button>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────

function IconSettings() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }} aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s: Record<string, CSSProperties> = {
  root: {
    background: 'var(--bg-secondary)',
    borderRadius: 20,
    padding: '1.5rem',
  },

  // Toggle
  toggleRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: '1.25rem',
  },
  toggle: {
    display: 'inline-flex',
    background: 'var(--bg-primary)',
    border: '0.5px solid var(--border-color)',
    borderRadius: 9999,
    padding: 4,
  },
  toggleActive: {
    border: 'none',
    background: GYM_COLOR,
    padding: '6px 16px',
    borderRadius: 9999,
    fontSize: 13,
    color: '#fff',
    fontWeight: 500,
    cursor: 'pointer',
  },
  toggleInactive: {
    border: 'none',
    background: 'transparent',
    padding: '6px 16px',
    borderRadius: 9999,
    fontSize: 13,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  // Header row
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.06em',
    color: 'var(--text-secondary)',
  },
  btnOutline: {
    border: '0.5px solid var(--border-color)',
    background: 'var(--bg-primary)',
    padding: '6px 12px',
    borderRadius: 12,
    fontSize: 12,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },

  // Grid
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12,
    marginBottom: 12,
  },

  // Card
  card: {
    background: 'var(--bg-primary)',
    border: '0.5px solid var(--border-color)',
    borderRadius: 16,
    padding: 14,
    cursor: 'pointer',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardName: {
    fontSize: 11,
    color: 'var(--text-secondary)',
    fontWeight: 500,
    letterSpacing: '0.04em',
  },
  cardCtx: {
    fontSize: 10,
    color: 'var(--text-muted)',
  },
  cardValue: {
    fontSize: 26,
    fontWeight: 500,
    color: GYM_COLOR,
    lineHeight: 1.1,
    marginBottom: 6,
  },
  cardUnit: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    fontWeight: 400,
  },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  badge: {
    fontSize: 11,
    padding: '2px 7px',
    borderRadius: 9999,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  cardDays: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },

  // Add card
  addCard: {
    background: 'transparent',
    border: '0.5px dashed var(--border-color)',
    borderRadius: 16,
    padding: 14,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 124,
    gap: 6,
  },
  addCardLabel: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    textAlign: 'center',
    lineHeight: 1.3,
  },

  // CTA bottom
  btnRegister: {
    width: '100%',
    background: 'var(--bg-primary)',
    border: '0.5px solid var(--border-color)',
    borderRadius: 12,
    padding: 10,
    fontSize: 13,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  // Error
  error: {
    fontSize: 13,
    color: '#dc2626',
    background: '#fee2e2',
    border: '1px solid #fca5a5',
    borderRadius: 10,
    padding: '10px 14px',
    marginBottom: 10,
  },

  // Skeleton
  bone: {
    borderRadius: 6,
    background: 'var(--border-color)',
  },
};

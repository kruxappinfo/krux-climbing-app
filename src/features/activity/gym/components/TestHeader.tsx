import React from 'react';
import type { CSSProperties } from 'react';
import type { TestRepository } from '../repositories/TestRepository';
import type { TestHeaderCardState } from '../types/test.types';
import { useTestHeader } from '../hooks/useTestHeader';
import { formatTestValue, formatDelta, formatDaysAgo } from '../services/formatTest';

// ─────────────────────────────────────────────────────────────────────────────
// Sparkline
// ─────────────────────────────────────────────────────────────────────────────

const SW = 88;
const SH = 36;
const SP = 3; // padding

const TREND_COLOR: Record<'up' | 'down' | 'flat', string> = {
  up:   '#7c3aed',
  down: '#ef4444',
  flat: '#94a3b8',
};

function Sparkline({
  values,
  trend,
}: {
  values: readonly number[];
  trend: 'up' | 'down' | 'flat';
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const pts = values
    .map((v, i) => {
      const x = SP + (i / (values.length - 1)) * (SW - SP * 2);
      const y = SH - SP - ((v - min) / range) * (SH - SP * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const color = TREND_COLOR[trend];
  const lastV = values[values.length - 1];
  const dotX = (SW - SP).toFixed(1);
  const dotY = (SH - SP - ((lastV - min) / range) * (SH - SP * 2)).toFixed(1);

  return (
    <svg
      width="100%"
      height={SH}
      viewBox={`0 0 ${SW} ${SH}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* Area fill */}
      <defs>
        <linearGradient id={`sg-${trend}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon
        points={`${SP},${SH} ${pts} ${SW - SP},${SH}`}
        fill={`url(#sg-${trend})`}
      />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={dotX} cy={dotY} r="2.5" fill={color} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────

function Bone({ w, h, mb = 0 }: { w: number | string; h: number; mb?: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        marginBottom: mb,
        borderRadius: 6,
        background: 'var(--border-color)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
  );
}

function CardSkeleton() {
  return (
    <div style={s.card} aria-hidden>
      <Bone w={60} h={10} mb={10} />
      <Bone w={80} h={28} mb={6} />
      <Bone w={52} h={18} mb={4} />
      <Bone w={38} h={10} mb={12} />
      <Bone w="100%" h={SH} />
      <Bone w="100%" h={28} mb={0} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single card
// ─────────────────────────────────────────────────────────────────────────────

function TestCard({
  state,
  onRecord,
}: {
  state: TestHeaderCardState;
  onRecord: (testId: string) => void;
}) {
  const { test, latest, delta, deltaPercent, daysSinceLatest, sparkline, trend } = state;
  const d = formatDelta(delta, test);

  const deltaStyle: CSSProperties = {
    ...s.delta,
    color:
      d.sign === 'positive' ? '#16a34a'
      : d.sign === 'negative' ? '#dc2626'
      : 'var(--text-muted)',
    background:
      d.sign === 'positive' ? '#dcfce7'
      : d.sign === 'negative' ? '#fee2e2'
      : 'transparent',
  };

  return (
    <article style={s.card}>
      <div style={s.cardName}>{test.name}</div>

      <div style={s.cardValue}>{formatTestValue(latest, test)}</div>

      <div style={deltaStyle}>
        {d.text}
        {deltaPercent !== null && (
          <span style={s.deltaPercent}>
            &nbsp;({deltaPercent > 0 ? '+' : ''}{deltaPercent.toFixed(0)}%)
          </span>
        )}
      </div>

      <div style={s.cardDays}>{formatDaysAgo(daysSinceLatest)}</div>

      <div style={s.sparklineWrap}>
        <Sparkline values={sparkline} trend={trend} />
      </div>

      <button
        style={s.cardBtn}
        onClick={() => onRecord(test.id)}
        aria-label={`Registrar medición de ${test.name}`}
      >
        + Registrar
      </button>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TestHeader
// ─────────────────────────────────────────────────────────────────────────────

export interface TestHeaderProps {
  repo: TestRepository;
  onConfigureTests?: () => void;
  onRecordMeasurement?: (testId: string) => void;
}

export function TestHeader({ repo, onConfigureTests, onRecordMeasurement }: TestHeaderProps) {
  const { cards, loading, error } = useTestHeader(repo);

  const firstTestId = cards[0]?.test.id ?? '';

  return (
    <section style={s.root} aria-label="Tests de rendimiento">

      {/* ── Header row ─────────────────────────────────────────── */}
      <div style={s.headerRow}>
        <h2 style={s.sectionTitle}>Tests de rendimiento</h2>
        <div style={s.headerActions}>
          <button style={s.btnSecondary} onClick={onConfigureTests}>
            <IconSettings />
            Configurar tests
          </button>
          <button
            style={s.btnPrimary}
            onClick={() => onRecordMeasurement?.(firstTestId)}
            disabled={loading || cards.length === 0}
          >
            <IconPlus />
            Registrar medición
          </button>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && (
        <div style={s.error} role="alert">
          No se pudieron cargar los tests: {error.message}
        </div>
      )}

      {/* ── Cards scroll ───────────────────────────────────────── */}
      <div style={s.scroll} role="list">
        {loading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : cards.length === 0 ? (
          <div style={s.empty}>
            <div style={s.emptyIcon}>📊</div>
            <p style={s.emptyTitle}>Sin tests configurados</p>
            <p style={s.emptyHint}>
              Añade tests de rendimiento para hacer seguimiento de tu progreso
            </p>
            <button style={s.btnPrimary} onClick={onConfigureTests}>
              Añadir mi primer test
            </button>
          </div>
        ) : (
          cards.map((state) => (
            <TestCard
              key={state.test.id}
              state={state}
              onRecord={(id) => onRecordMeasurement?.(id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────

function IconSettings() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }} aria-hidden>
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
    width: '100%',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: '0.625rem',
    flexWrap: 'wrap',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    margin: 0,
  },
  headerActions: {
    display: 'flex',
    gap: 6,
    flexShrink: 0,
  },

  // Buttons
  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 12,
    fontWeight: 500,
    padding: '5px 12px',
    borderRadius: 9999,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-primary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 12,
    fontWeight: 500,
    padding: '5px 12px',
    borderRadius: 9999,
    border: 'none',
    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    color: '#fff',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },

  // Scroll container
  scroll: {
    display: 'flex',
    gap: 10,
    overflowX: 'auto',
    overflowY: 'hidden',
    paddingBottom: 8,
    scrollSnapType: 'x mandatory',
    WebkitOverflowScrolling: 'touch',
    // Hide scrollbar visually but keep functional
    msOverflowStyle: 'none',
  },

  // Card
  card: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 152,
    maxWidth: 172,
    flexShrink: 0,
    background: 'linear-gradient(135deg, #f5f3ff 0%, #faf5ff 100%)',
    border: '1px solid rgba(124, 58, 237, 0.12)',
    borderRadius: 16,
    padding: '14px 14px 10px',
    scrollSnapAlign: 'start',
    gap: 0,
  },
  cardName: {
    fontSize: 10,
    fontWeight: 600,
    color: '#7c3aed',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: 8,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardValue: {
    fontSize: 26,
    fontWeight: 600,
    color: 'var(--text-primary)',
    lineHeight: 1,
    marginBottom: 6,
    letterSpacing: '-0.02em',
  },
  delta: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 12,
    fontWeight: 500,
    padding: '2px 7px',
    borderRadius: 9999,
    alignSelf: 'flex-start',
    marginBottom: 3,
  },
  deltaPercent: {
    fontSize: 11,
    fontWeight: 400,
    opacity: 0.75,
  },
  cardDays: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginBottom: 8,
    marginLeft: 2,
  },
  sparklineWrap: {
    marginBottom: 10,
  },
  cardBtn: {
    fontSize: 11,
    fontWeight: 500,
    padding: '5px 0',
    borderRadius: 8,
    border: '1px solid rgba(124, 58, 237, 0.25)',
    background: 'transparent',
    color: '#7c3aed',
    cursor: 'pointer',
    textAlign: 'center',
    width: '100%',
  },

  // Skeleton pulse
  skeleton: {
    borderRadius: 6,
    background: 'rgba(124, 58, 237, 0.08)',
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

  // Empty state
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '28px 24px',
    background: 'linear-gradient(135deg, #f5f3ff 0%, #faf5ff 100%)',
    border: '1px dashed rgba(124, 58, 237, 0.25)',
    borderRadius: 16,
    width: '100%',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: 28,
    lineHeight: 1,
    marginBottom: 4,
  },
  emptyTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  emptyHint: {
    margin: 0,
    fontSize: 12,
    color: 'var(--text-secondary)',
    maxWidth: 240,
  },
};

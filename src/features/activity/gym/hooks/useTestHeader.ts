import { useState, useEffect, useRef } from 'react';
import type { TestRepository } from '../repositories/TestRepository';
import type { TestDefinition, TestMeasurement } from '../types/test.types';
import type { TestHeaderCardState } from '../types/test.types';
import { buildHeaderCards } from '../services/testStats.service';

export interface UseTestHeaderResult {
  cards: TestHeaderCardState[];
  loading: boolean;
  error: Error | null;
}

/**
 * Subscribes to live definitions and measurements, recomputes header cards
 * whenever either stream emits, and cleans up both subscriptions on unmount.
 */
export function useTestHeader(repo: TestRepository): UseTestHeaderResult {
  const [cards, setCards] = useState<TestHeaderCardState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Keep latest snapshot of each stream so either subscription can trigger a recompute.
  const defsRef = useRef<TestDefinition[]>([]);
  const measuresRef = useRef<TestMeasurement[]>([]);

  useEffect(() => {
    let mounted = true;

    function recompute() {
      if (!mounted) return;
      setCards(buildHeaderCards(defsRef.current, measuresRef.current));
      setLoading(false);
    }

    const unsubDefs = repo.subscribeDefinitions(
      (defs) => {
        defsRef.current = defs;
        recompute();
      },
      (err) => {
        if (mounted) setError(err);
      }
    );

    const unsubMeasures = repo.subscribeMeasurements(
      (measures) => {
        measuresRef.current = measures;
        recompute();
      },
      {},
      (err) => {
        if (mounted) setError(err);
      }
    );

    return () => {
      mounted = false;
      unsubDefs();
      unsubMeasures();
    };
  }, [repo]);

  return { cards, loading, error };
}

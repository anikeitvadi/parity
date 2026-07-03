import { useEffect, useState } from 'react';
import {
  fetchEfficiencyStudy,
  fetchStrictSurvivors,
  type EfficiencyStudy,
  type StrictSurvivors,
} from '../api/client.js';
import { buildVerifierIndex, type VerifierRecord } from './verifier.js';

/**
 * The live↔frozen-study verifier index, fetched ONCE and cached at module scope so every consumer
 * (queue rows, decision pane) shares a single fetch + a single built index — no prop-threading. ~19%
 * of live rows match the study; the rest resolve to `live_only`. Index is empty until the study
 * loads (rows show `live_only` meanwhile — never a false claim).
 */
let studyCache: EfficiencyStudy | null = null;
let strictCache: StrictSurvivors | null = null;
let indexCache: Map<string, VerifierRecord> | null = null;
let loadPromise: Promise<void> | null = null;

function load(): Promise<void> {
  if (!loadPromise) {
    loadPromise = Promise.all([
      fetchEfficiencyStudy().then((r) => { if (r.available && r.study) studyCache = r.study; }).catch(() => {}),
      fetchStrictSurvivors().then((r) => { if (r.available && r.data) strictCache = r.data; }).catch(() => {}),
    ]).then(() => {
      if (studyCache) indexCache = buildVerifierIndex(studyCache, strictCache ?? undefined);
    });
  }
  return loadPromise;
}

const EMPTY: Map<string, VerifierRecord> = new Map();

export function useVerifierIndex(): {
  index: Map<string, VerifierRecord>;
  study: EfficiencyStudy | null;
  strict: StrictSurvivors | null;
  ready: boolean;
} {
  const [, force] = useState(0);
  useEffect(() => {
    if (indexCache) return;
    let alive = true;
    load().then(() => { if (alive) force((n) => n + 1); });
    return () => { alive = false; };
  }, []);
  return { index: indexCache ?? EMPTY, study: studyCache, strict: strictCache, ready: indexCache != null };
}

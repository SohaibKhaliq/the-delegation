// Meta Muse Spark token pricing (VIEW-ONLY dashboard, no Gemini).
//
// Rates: Muse Spark 1.3, Meta Model API, Standard tier, September 2026:
//   $1.25 per 1M input tokens
//   $4.25 per 1M output tokens
//   $0.15 per 1M cached input tokens
// (Contributor-tier rates $0.10/$0.20 are NOT used here.)
//
// Cost formula (exactly as specified):
//   cost = (input / 1,000,000) * 1.25
//        + (output / 1,000,000) * 4.25
//        + (cachedInput / 1,000,000) * 0.15
// Cached input is counted only when a cached count exists; otherwise it
// is 0 and contributes nothing. No other rates are used anywhere in the
// Muse token panel, and the old Gemini price table is not consulted.

import type { MuseTokenUsage } from './museTypes';

export const MUSE_SPARK_MODEL = 'Muse Spark 1.3';
export const MUSE_SPARK_TIER = 'Meta Model API, Standard tier';
export const MUSE_SPARK_INPUT_PER_1M = 1.25;
export const MUSE_SPARK_OUTPUT_PER_1M = 4.25;
export const MUSE_SPARK_CACHED_INPUT_PER_1M = 0.15;

export function museTokenCost(usage: MuseTokenUsage): number {
  const input = Math.max(0, usage.inputTokens || 0);
  const output = Math.max(0, usage.outputTokens || 0);
  const cached = Math.max(0, usage.cachedInputTokens || 0);
  return (
    (input / 1_000_000) * MUSE_SPARK_INPUT_PER_1M +
    (output / 1_000_000) * MUSE_SPARK_OUTPUT_PER_1M +
    (cached / 1_000_000) * MUSE_SPARK_CACHED_INPUT_PER_1M
  );
}

/** Sum token fields over a list of events (the feed's current events). */
export function sumEventTokens(
  events: Array<{
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
  }>,
): MuseTokenUsage {
  return events.reduce<MuseTokenUsage>(
    (acc, e) => ({
      inputTokens: acc.inputTokens + Math.max(0, e.inputTokens || 0),
      outputTokens: acc.outputTokens + Math.max(0, e.outputTokens || 0),
      cachedInputTokens: acc.cachedInputTokens + Math.max(0, e.cachedInputTokens || 0),
    }),
    { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  );
}

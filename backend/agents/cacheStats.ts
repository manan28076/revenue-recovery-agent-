// Tracks real, honest numbers for the semantic cache in qaAgent.ts —
// no estimated dollar figures (Gemini pricing changes and varies by
// prompt size), just what we can actually prove: hits, misses, and the
// exact number of Gemini API calls avoided as a direct result.

let hits = 0;
let misses = 0;

// Each cache hit skips exactly 2 generateContent calls that a miss would
// otherwise make: the filter-extraction call and the answer-phrasing call.
const CALLS_SAVED_PER_HIT = 2;

export function recordCacheHit() {
  hits += 1;
}

export function recordCacheMiss() {
  misses += 1;
}

export function getCacheStats() {
  const totalQueries = hits + misses;
  const hitRate = totalQueries === 0 ? 0 : hits / totalQueries;
  return {
    hits,
    misses,
    totalQueries,
    hitRate: Number(hitRate.toFixed(4)),
    apiCallsSaved: hits * CALLS_SAVED_PER_HIT,
  };
}

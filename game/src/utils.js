// Small numeric helpers and a reproducible random source for demo mode.
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (start, end, amount) => start + (end - start) * amount;

export function rng(seed = 1) {
  let value = seed | 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let word = Math.imul(value ^ (value >>> 15), 1 | value);
    word = (word + Math.imul(word ^ (word >>> 7), 61 | word)) ^ word;
    return ((word ^ (word >>> 14)) >>> 0) / 4294967296;
  };
}

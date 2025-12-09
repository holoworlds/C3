

import { Candle, IntervalType } from "../types";

// Explicit list of intervals supported natively by Binance Futures
const NATIVE_INTERVALS = [
  '1m', '3m', '5m', '15m', '30m', 
  '1h', '2h', '4h', '6h', '8h', '12h', 
  '1d', '3d', '1w', '1M'
];

// Helper to convert interval string to milliseconds
export const intervalToMs = (interval: string): number => {
  const match = interval.match(/^(\d+)([a-zA-Z]+)$/);
  if (!match) return 60000;
  const value = parseInt(match[1]);
  const unit = match[2];
  
  let mult = 60 * 1000; // default m
  if (unit === 's') mult = 1000;
  if (unit === 'm') mult = 60 * 1000;
  if (unit === 'h') mult = 60 * 60 * 1000;
  if (unit === 'd') mult = 24 * 60 * 60 * 1000;
  if (unit === 'w') mult = 7 * 24 * 60 * 60 * 1000;
  if (unit === 'M') mult = 30 * 24 * 60 * 60 * 1000; 

  return value * mult;
};

// Determine the best native Binance interval to use as a base for resampling
// STRATEGY: Native First -> Smart Synthesis
export const determineBaseConfig = (targetInterval: IntervalType): { baseInterval: IntervalType, isNative: boolean } => {
  
  // 1. Native Priority: If Binance supports it, use it directly.
  if (NATIVE_INTERVALS.includes(targetInterval as string)) {
    return { baseInterval: targetInterval, isNative: true };
  }

  // 2. Smart Synthesis Mappings (Optimal Base Source)
  const mappings: Record<string, string> = {
    '2m': '1m',   // 1m * 2
    '31m': '1m',  // 1m * 31 (Prime number, best fit is 1m)
    
    '6m': '3m', // Adjusted for mathematical correctness (3m * 2 = 6m)

    '10m': '5m',  // 5m * 2
    '20m': '5m',  // 5m * 4
    
    '45m': '15m', // 15m * 3
    
    '3h': '1h',   // 1h * 3
    '10h': '2h',  // 2h * 5
    
    '2d': '1d',   // 1d * 2
  };

  if (mappings[targetInterval]) {
      return { baseInterval: mappings[targetInterval] as IntervalType, isNative: false };
  }

  // Fallback to 1m (High Frequency) for any unknown odd intervals
  return { baseInterval: '1m', isNative: false };
};

// Core Resampling Logic
export const resampleCandles = (baseCandles: Candle[], targetInterval: IntervalType, baseInterval: IntervalType): Candle[] => {
  const targetMs = intervalToMs(targetInterval);
  const baseMs = intervalToMs(baseInterval);
  
  const resampledMap: Map<number, Candle> = new Map();

  for (const base of baseCandles) {
    // Determine the start time of the target candle this base candle belongs to
    const targetStartTime = Math.floor(base.time / targetMs) * targetMs;
    
    if (!resampledMap.has(targetStartTime)) {
      resampledMap.set(targetStartTime, {
        symbol: base.symbol, // Preserve Identity
        time: targetStartTime,
        open: base.open,
        high: base.high,
        low: base.low,
        close: base.close,
        volume: base.volume,
        isClosed: false
      });
    }

    const current = resampledMap.get(targetStartTime)!;
    
    // Update High/Low/Close/Volume
    current.high = Math.max(current.high, base.high);
    current.low = Math.min(current.low, base.low);
    current.close = base.close;
    current.volume += base.volume;

    // Check closure logic
    // Logic: The target candle is closed if the base candle is the LAST segment of the target duration AND is closed.
    const baseEndTime = base.time + baseMs;
    const targetEndTime = targetStartTime + targetMs;
    
    // E.g. Target 10m (00:00-00:10). Base 5m.
    // 1. 00:00-00:05 (Base End 00:05). Not >= Target End. Open.
    // 2. 00:05-00:10 (Base End 00:10). >= Target End. If Base closed, Target closed.
    if (base.isClosed && baseEndTime >= targetEndTime) {
        current.isClosed = true;
    }
  }

  return Array.from(resampledMap.values()).sort((a, b) => a.time - b.time);
};
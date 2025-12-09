
import { Candle, IntervalType } from "../types";

const STANDARD_INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];

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
export const determineBaseConfig = (targetInterval: IntervalType): { baseInterval: IntervalType, isNative: boolean } => {
  if (STANDARD_INTERVALS.includes(targetInterval as string)) {
    return { baseInterval: targetInterval, isNative: true };
  }

  // Mappings for non-standard intervals to their largest common divisor standard interval
  // This ensures we fetch the maximum relevant history and resample efficiently.
  const mappings: Record<string, string> = {
    '2m': '1m',
    '6m': '3m',
    '10m': '5m',
    '20m': '5m',
    '31m': '1m',
    '45m': '15m',
    '3h': '1h',
    '10h': '2h',
    '2d': '1d'
  };

  if (mappings[targetInterval]) {
      return { baseInterval: mappings[targetInterval] as IntervalType, isNative: false };
  }

  // Fallback to 1m if unknown
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
    // A target candle is considered closed if the current base candle is closed 
    // AND it aligns with the end of the target period.
    const baseEndTime = base.time + baseMs;
    const targetEndTime = targetStartTime + targetMs;
    
    // Allow for small time drift tolerance if needed
    if (base.isClosed && baseEndTime >= targetEndTime) {
        current.isClosed = true;
    }
  }

  return Array.from(resampledMap.values()).sort((a, b) => a.time - b.time);
};

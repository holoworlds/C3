

import { Candle, IntervalType, SymbolType } from "../types";
import { BINANCE_REST_BASE } from "../constants";

export const fetchHistoricalCandles = async (
  symbol: SymbolType, 
  interval: IntervalType, 
  startTime?: number, 
  endTime?: number
): Promise<Candle[]> => {
  try {
    // Binance Futures Endpoint: /klines
    // Increase limit to 1500 (max allowed) to support resampling from smaller intervals
    let url = `${BINANCE_REST_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=1500`;
    
    if (startTime) {
        url += `&startTime=${startTime}`;
    }
    if (endTime) {
        url += `&endTime=${endTime}`;
    }
    
    const response = await fetch(url);
    const data = await response.json();

    if (!Array.isArray(data)) {
        console.error("Invalid response from Binance (Expected Array):", JSON.stringify(data));
        return [];
    }

    return data.map((d: any) => ({
      symbol: symbol, // Inject Identity
      time: d[0],
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5]),
      isClosed: true
    }));

  } catch (error) {
    console.error("Failed to fetch historical data", error);
    return [];
  }
};

export const parseSocketMessage = (msg: any): Candle | null => {
  if (msg.e !== 'kline') return null;
  const k = msg.k;

  return {
    symbol: msg.s, // Binance provides symbol in 's' field of the data payload. Vital for Zero Tolerance check.
    time: k.t,
    open: parseFloat(k.o),
    high: parseFloat(k.h),
    low: parseFloat(k.l),
    close: parseFloat(k.c),
    volume: parseFloat(k.v),
    isClosed: k.x
  };
};

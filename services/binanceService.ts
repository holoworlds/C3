
import { Candle, IntervalType, SymbolType } from "../types";
import { BINANCE_REST_BASE } from "../constants";

export const fetchHistoricalCandles = async (symbol: SymbolType, interval: IntervalType): Promise<Candle[]> => {
  try {
    // Binance Futures Endpoint: /klines
    // Increased limit to 499 to ensure EMA99 and other long-period indicators calculate correctly
    const url = `${BINANCE_REST_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=499`;
    const response = await fetch(url);
    const data = await response.json();

    // Binance Futures Response format is identical to Spot for the first 6 elements
    // [
    //   [1499040000000, "0.01634790", "0.80000000", "0.01575800", "0.01577100", "148976.11500000", ... ]
    // ]

    if (!Array.isArray(data)) {
        console.error("Invalid response from Binance:", data);
        return [];
    }

    return data.map((d: any) => ({
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
  // Binance Futures Kline Stream Format is mostly the same
  // {
  //   "e": "kline",
  //   "k": { ... }
  // }
  
  if (msg.e !== 'kline') return null;
  const k = msg.k;

  return {
    time: k.t,
    open: parseFloat(k.o),
    high: parseFloat(k.h),
    low: parseFloat(k.l),
    close: parseFloat(k.c),
    volume: parseFloat(k.v),
    isClosed: k.x
  };
};


import { StrategyConfig } from "./types";

export const AVAILABLE_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'ZECUSDT'] as const;

// Symbols that will be monitored in the background immediately upon server start
export const PRELOAD_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'ZECUSDT'];

// Extended list of intervals as requested. Added 8h which was missing.
export const AVAILABLE_INTERVALS = [
  '1m', '2m', '3m', '5m', '6m', '10m', '15m', '20m', '30m', '31m', '45m', 
  '1h', '2h', '3h', '4h', '6h', '8h', '10h', '12h', 
  '1d', '2d', '3d', '1w', '1M'
] as const; 

// Binance Futures (USDT-M) API Endpoints
export const BINANCE_WS_BASE = 'wss://fstream.binance.com/stream?streams='; // Using Combined Stream
export const BINANCE_REST_BASE = 'https://fapi.binance.com/fapi/v1';

export const DEFAULT_CONFIG: StrategyConfig = {
  id: 'default_1',
  name: 'BTC 策略 #1',
  isActive: false, // Default: Closed

  symbol: 'BTCUSDT',
  interval: '1m',
  tradeAmount: 0, // Default: 0
  webhookUrl: 'http://43.167.199.156:80/webhookbinance',
  secret: '',
  
  triggerOnClose: false, // Default to Intraday triggering

  manualTakeover: false,
  takeoverDirection: 'FLAT', // Must prevent undefined
  takeoverQuantity: 1.0,
  takeoverTimestamp: '',

  trendFilterBlockShort: false,
  trendFilterBlockLong: false,

  // EMA 7/25
  useEMA7_25: true, 
  ema7_25_Long: true,
  ema7_25_Short: true,
  ema7_25_ExitLong: true,
  ema7_25_ExitShort: true,

  // EMA 7/99
  useEMA7_99: false,
  ema7_99_Long: false,
  ema7_99_Short: false,
  ema7_99_ExitLong: false,
  ema7_99_ExitShort: false,

  // EMA 25/99
  useEMA25_99: false,
  ema25_99_Long: false,
  ema25_99_Short: false,
  ema25_99_ExitLong: false,
  ema25_99_ExitShort: false,

  // Double EMA
  useEMADouble: false,
  emaDoubleLong: false,
  emaDoubleShort: false,
  emaDoubleExitLong: false,
  emaDoubleExitShort: false,

  // MACD
  useMACD: false,
  macdFast: 50,
  macdSlow: 150,
  macdSignal: 9,
  macdLong: false,
  macdShort: false,
  macdExitLong: false,
  macdExitShort: false,

  // Trailing Stop
  useTrailingStop: false,
  trailActivation: 1.0,
  trailDistance: 0.5,

  // Fixed TP/SL
  useFixedTPSL: false,
  takeProfitPct: 2.0,
  stopLossPct: 1.0,

  // Multi Level TP/SL
  useMultiTPSL: false,
  tpLevels: [
    { active: true, pct: 2.0, qtyPct: 25 },
    { active: true, pct: 4.0, qtyPct: 25 },
    { active: false, pct: 6.0, qtyPct: 25 },
    { active: false, pct: 8.0, qtyPct: 25 },
  ],
  slLevels: [
    { active: true, pct: 1.0, qtyPct: 25 },
    { active: false, pct: 2.0, qtyPct: 25 },
    { active: false, pct: 3.0, qtyPct: 25 },
    { active: false, pct: 4.0, qtyPct: 25 },
  ],

  useReverse: false,
  reverseLongToShort: true,
  reverseShortToLong: true,

  maxDailyTrades: 5,
};

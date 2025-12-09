
export type SymbolType = string;
export type IntervalType = 
  | '1m' | '2m' | '3m' | '5m' | '6m' | '10m' | '15m' | '20m' | '30m' | '31m' | '45m' 
  | '1h' | '2h' | '3h' | '4h' | '6h' | '10h' | '12h' 
  | '1d' | '2d' | '3d' | '1w' | '1M';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
  // Indicators
  ema7?: number;
  ema25?: number;
  ema99?: number;
  macdLine?: number;
  macdSignal?: number;
  macdHist?: number;
}

export interface WebhookPayload {
  secret: string;
  action: string;
  position: string;
  symbol: string;
  trade_amount: number; // USDT Value of the specific trade action
  leverage: number;
  timestamp: string;
  tv_exchange: string;
  strategy_name: string;
  tp_level: string;
  // New Display Fields
  execution_price?: number;
  execution_quantity?: number;
}

export interface AlertLog {
  id: string;
  strategyId: string; // Link log to a strategy
  strategyName: string;
  timestamp: number;
  payload: WebhookPayload;
  status: 'sent' | 'pending';
  type: string;
}

// --- Strategy Configuration Interfaces ---

export interface StrategyConfig {
  id: string;
  name: string; // User friendly name
  isActive: boolean; // Whether strategy is running

  // General
  symbol: SymbolType;
  interval: IntervalType;
  tradeAmount: number; // Initial entry amount in USDT
  webhookUrl: string;
  secret: string;

  // Signal Trigger Mode
  triggerOnClose: boolean; // false = Intraday (Realtime), true = On Candle Close

  // Manual Control
  manualTakeover: boolean; // If true, auto signals are blocked
  takeoverDirection: 'LONG' | 'SHORT' | 'FLAT'; // Configured direction
  takeoverQuantity: number;
  takeoverTimestamp: string; // YYYY-MM-DD HH:mm:ss

  // Trend Filter
  trendFilterBlockShort: boolean; // 7 > 25 > 99 时不开空
  trendFilterBlockLong: boolean; // 7 < 25 < 99 时不开多

  // Signals - EMA Cross Logic
  useEMA7_25: boolean;
  ema7_25_Long: boolean; // 上穿开多
  ema7_25_Short: boolean; // 下穿开空
  ema7_25_ExitLong: boolean; // 下穿平多
  ema7_25_ExitShort: boolean; // 上穿平空

  useEMA7_99: boolean;
  ema7_99_Long: boolean;
  ema7_99_Short: boolean;
  ema7_99_ExitLong: boolean;
  ema7_99_ExitShort: boolean;

  useEMA25_99: boolean;
  ema25_99_Long: boolean;
  ema25_99_Short: boolean;
  ema25_99_ExitLong: boolean;
  ema25_99_ExitShort: boolean;

  // EMA Double (7/25 vs 99)
  useEMADouble: boolean; 
  emaDoubleLong: boolean; // 7/25 上穿 99 开多
  emaDoubleShort: boolean; // 7/25 下穿 99 开空
  emaDoubleExitLong: boolean; // 7/25 下穿 99 平多
  emaDoubleExitShort: boolean; // 7/25 上穿 99 平空

  // Signals - MACD
  useMACD: boolean;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  
  macdLong: boolean; // 金叉开多
  macdShort: boolean; // 死叉开空
  macdExitLong: boolean; // 死叉平多
  macdExitShort: boolean; // 金叉平空

  // Trailing Stop
  useTrailingStop: boolean;
  trailActivation: number; 
  trailDistance: number; 

  // Fixed TP/SL
  useFixedTPSL: boolean;
  takeProfitPct: number;
  stopLossPct: number;

  // Multi Level TP/SL
  useMultiTPSL: boolean;
  tpLevels: { pct: number; qtyPct: number; active: boolean }[];
  slLevels: { pct: number; qtyPct: number; active: boolean }[];

  // Reverse
  useReverse: boolean;
  reverseLongToShort: boolean;
  reverseShortToLong: boolean;

  // Risk / Limits
  maxDailyTrades: number;
}

// --- Internal State for the Strategy Engine ---

export interface PositionState {
  direction: 'LONG' | 'SHORT' | 'FLAT';
  
  initialQuantity: number; // Total quantity at entry
  remainingQuantity: number; // Current quantity held
  
  entryPrice: number;
  highestPrice: number; // For Trailing Stop Long
  lowestPrice: number; // For Trailing Stop Short
  openTime: number;
  tpLevelsHit: boolean[]; 
  slLevelsHit: boolean[]; 
}

export interface TradeStats {
  dailyTradeCount: number;
  lastTradeDate: string; // ISO Date String YYYY-MM-DD
}

// Container for a running strategy instance
export interface StrategyRuntime {
  config: StrategyConfig;
  candles: Candle[];
  positionState: PositionState;
  tradeStats: TradeStats;
  lastPrice: number;
}


import { Candle, StrategyConfig, PositionState, TradeStats, WebhookPayload } from "../types";

// Helper to determine crosses
const crossOver = (currA: number, currB: number, prevA: number, prevB: number) => prevA <= prevB && currA > currB;
const crossUnder = (currA: number, currB: number, prevA: number, prevB: number) => prevA >= prevB && currA < currB;

export interface StrategyResult {
  newPositionState: PositionState;
  newTradeStats: TradeStats;
  actions: WebhookPayload[];
}

export const evaluateStrategy = (
  candles: Candle[],
  config: StrategyConfig,
  currentPosition: PositionState,
  tradeStats: TradeStats
): StrategyResult => {
  const actions: WebhookPayload[] = [];
  let nextPos = { ...currentPosition };
  let nextStats = { ...tradeStats };

  // 1. Basic Validation - Ensure enough data for indicators (EMA99 needs ~100+ candles to settle, but strict check here)
  if (candles.length < 50 || !config.isActive) {
    return { newPositionState: nextPos, newTradeStats: nextStats, actions };
  }

  // 2. Manual Takeover Check
  if (config.manualTakeover) {
    return { newPositionState: nextPos, newTradeStats: nextStats, actions };
  }

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const now = new Date();
  const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD

  // Reset daily stats if new day
  if (nextStats.lastTradeDate !== dateKey) {
    nextStats.dailyTradeCount = 0;
    nextStats.lastTradeDate = dateKey;
  }

  // --- Check Trigger Mode for Signals ---
  // If triggerOnClose is true, only evaluate signals if the candle is closed.
  // Note: This applies to EMA/MACD Entries and Exits. TP/SL is always realtime.
  const isSignalTrigger = config.triggerOnClose ? last.isClosed : true;


  // --- 3. Check Technical Signals ---
  
  if (last.ema7 === undefined || last.ema25 === undefined || last.ema99 === undefined) {
    return { newPositionState: nextPos, newTradeStats: nextStats, actions };
  }
  
  // Trend Filter Logic
  const isTrendLong = (last.ema7 > last.ema25 && last.ema25 > last.ema99);
  const isTrendShort = (last.ema7 < last.ema25 && last.ema25 < last.ema99);
  
  // Block flags
  const blockShort = config.trendFilterBlockShort && isTrendLong; // If uptrend, block short
  const blockLong = config.trendFilterBlockLong && isTrendShort;  // If downtrend, block long

  // EMA Crosses
  const ema7_25_Up = config.useEMA7_25 && crossOver(last.ema7, last.ema25, prev.ema7!, prev.ema25!);
  const ema7_25_Down = config.useEMA7_25 && crossUnder(last.ema7, last.ema25, prev.ema7!, prev.ema25!);
  
  const ema7_99_Up = config.useEMA7_99 && crossOver(last.ema7, last.ema99, prev.ema7!, prev.ema99!);
  const ema7_99_Down = config.useEMA7_99 && crossUnder(last.ema7, last.ema99, prev.ema7!, prev.ema99!);

  const ema25_99_Up = config.useEMA25_99 && crossOver(last.ema25, last.ema99, prev.ema25!, prev.ema99!);
  const ema25_99_Down = config.useEMA25_99 && crossUnder(last.ema25, last.ema99, prev.ema25!, prev.ema99!);

  // Double EMA Cross (7 or 25 crossing 99)
  const crossUp7_99 = crossOver(last.ema7, last.ema99, prev.ema7!, prev.ema99!);
  const crossUp25_99 = crossOver(last.ema25, last.ema99, prev.ema25!, prev.ema99!);
  const crossDown7_99 = crossUnder(last.ema7, last.ema99, prev.ema7!, prev.ema99!);
  const crossDown25_99 = crossUnder(last.ema25, last.ema99, prev.ema25!, prev.ema99!);

  const emaDouble_Up = config.useEMADouble && (crossUp7_99 || crossUp25_99); // Union of crosses Up
  const emaDouble_Down = config.useEMADouble && (crossDown7_99 || crossDown25_99); // Union of crosses Down


  // MACD
  const macdBuy = config.useMACD && last.macdLine !== undefined && last.macdSignal !== undefined && 
                  crossOver(last.macdLine, last.macdSignal, prev.macdLine!, prev.macdSignal!); // Golden Cross
  const macdSell = config.useMACD && last.macdLine !== undefined && last.macdSignal !== undefined &&
                   crossUnder(last.macdLine, last.macdSignal, prev.macdLine!, prev.macdSignal!); // Death Cross

  // --- 4. Determine Entry Conditions (Specific Reasons) ---
  
  let longEntryReason = '';
  if (isSignalTrigger && !blockLong) { 
     if (config.useEMA7_25 && config.ema7_25_Long && ema7_25_Up) longEntryReason = 'EMA7上穿25开多';
     else if (config.useEMA7_99 && config.ema7_99_Long && ema7_99_Up) longEntryReason = 'EMA7上穿99开多';
     else if (config.useEMA25_99 && config.ema25_99_Long && ema25_99_Up) longEntryReason = 'EMA25上穿99开多';
     else if (config.useEMADouble && config.emaDoubleLong && emaDouble_Up) longEntryReason = 'EMA7/25上穿99开多';
     else if (config.useMACD && config.macdLong && macdBuy) longEntryReason = 'MACD金叉开多';
  }

  let shortEntryReason = '';
  if (isSignalTrigger && !blockShort) { 
    if (config.useEMA7_25 && config.ema7_25_Short && ema7_25_Down) shortEntryReason = 'EMA7下穿25开空';
    else if (config.useEMA7_99 && config.ema7_99_Short && ema7_99_Down) shortEntryReason = 'EMA7下穿99开空';
    else if (config.useEMA25_99 && config.ema25_99_Short && ema25_99_Down) shortEntryReason = 'EMA25下穿99开空';
    else if (config.useEMADouble && config.emaDoubleShort && emaDouble_Down) shortEntryReason = 'EMA7/25下穿99开空';
    else if (config.useMACD && config.macdShort && macdSell) shortEntryReason = 'MACD死叉开空';
  }

  // --- 5. Determine Exit Conditions (Specific Reasons) ---
  
  let exitLongReason = '';
  if (isSignalTrigger) {
      if (config.useEMA7_25 && config.ema7_25_ExitLong && ema7_25_Down) exitLongReason = 'EMA7下穿25平多';
      else if (config.useEMA7_99 && config.ema7_99_ExitLong && ema7_99_Down) exitLongReason = 'EMA7下穿99平多';
      else if (config.useEMA25_99 && config.ema25_99_ExitLong && ema25_99_Down) exitLongReason = 'EMA25下穿99平多';
      else if (config.useEMADouble && config.emaDoubleExitLong && emaDouble_Down) exitLongReason = 'EMA7/25下穿99平多';
      else if (config.useMACD && config.macdExitLong && macdSell) exitLongReason = 'MACD死叉平多';
  }

  let exitShortReason = '';
  if (isSignalTrigger) {
      if (config.useEMA7_25 && config.ema7_25_ExitShort && ema7_25_Up) exitShortReason = 'EMA7上穿25平空';
      else if (config.useEMA7_99 && config.ema7_99_ExitShort && ema7_99_Up) exitShortReason = 'EMA7上穿99平空';
      else if (config.useEMA25_99 && config.ema25_99_ExitShort && ema25_99_Up) exitShortReason = 'EMA25上穿99平空';
      else if (config.useEMADouble && config.emaDoubleExitShort && emaDouble_Up) exitShortReason = 'EMA7/25上穿99平空';
      else if (config.useMACD && config.macdExitShort && macdBuy) exitShortReason = 'MACD金叉平空';
  }


  // --- 6. Execution State Machine ---
  
  const canOpen = nextStats.dailyTradeCount < config.maxDailyTrades;

  // Helper to generate Payload
  // NOTE: tradeAmount here should be the USDT Value of the action (Quantity * Price)
  const createPayload = (act: string, pos: string, comment: string, amountVal: number, qty: number): WebhookPayload => ({
    secret: config.secret,
    action: act,
    position: pos,
    symbol: config.symbol,
    trade_amount: amountVal, 
    leverage: 5,
    timestamp: now.toISOString(),
    tv_exchange: "BINANCE",
    strategy_name: config.name,
    tp_level: comment,
    execution_price: last.close,
    execution_quantity: qty
  });

  // A. Check Exits/Updates for Existing Positions
  if (nextPos.direction !== 'FLAT') {
      
      const isLong = nextPos.direction === 'LONG';
      const entryPrice = nextPos.entryPrice;
      const currentPrice = last.close;
      const profitPct = isLong 
        ? (currentPrice - entryPrice) / entryPrice * 100 
        : (entryPrice - currentPrice) / entryPrice * 100;

      let finalCloseReason = '';
      
      // 1. Signal Exit (Highest Priority for Full Close)
      if (isLong && exitLongReason) finalCloseReason = exitLongReason;
      if (!isLong && exitShortReason) finalCloseReason = exitShortReason;

      // 2. Fixed TP/SL (Only if Trailing and Multi are OFF, OR as per instruction)
      if (config.useFixedTPSL && !config.useTrailingStop && !config.useMultiTPSL && !finalCloseReason) {
          // Use High/Low for more accurate hit detection within the candle
          const longTPHit = isLong && last.high >= entryPrice * (1 + config.takeProfitPct/100);
          const longSLHit = isLong && last.low <= entryPrice * (1 - config.stopLossPct/100);
          const shortTPHit = !isLong && last.low <= entryPrice * (1 - config.takeProfitPct/100);
          const shortSLHit = !isLong && last.high >= entryPrice * (1 + config.stopLossPct/100);

          if (longTPHit || shortTPHit) finalCloseReason = '固定止盈触发';
          else if (longSLHit || shortSLHit) finalCloseReason = '固定止损触发';
      }

      // 3. Trailing Stop
      if (config.useTrailingStop && !finalCloseReason) {
         if (isLong) {
            nextPos.highestPrice = Math.max(nextPos.highestPrice, last.high);
            const stopPrice = nextPos.highestPrice * (1 - config.trailDistance / 100);
            const activationPrice = entryPrice * (1 + config.trailActivation / 100);
            if (nextPos.highestPrice >= activationPrice && last.low <= stopPrice) {
               finalCloseReason = '追踪止盈触发';
            }
         } else {
            nextPos.lowestPrice = Math.min(nextPos.lowestPrice, last.low);
            const stopPrice = nextPos.lowestPrice * (1 + config.trailDistance / 100);
            const activationPrice = entryPrice * (1 - config.trailActivation / 100);
            if (nextPos.lowestPrice <= activationPrice && last.high >= stopPrice) {
              finalCloseReason = '追踪止盈触发';
            }
         }
      }

      // 4. Multi-Level TP/SL
      if (config.useMultiTPSL && !config.useTrailingStop && !finalCloseReason) {
          // Take Profits
          config.tpLevels.forEach((tp, idx) => {
              if (!tp.active || nextPos.tpLevelsHit[idx] || nextPos.remainingQuantity <= 0.000001) return;
              
              const targetPrice = isLong 
                 ? entryPrice * (1 + tp.pct / 100)
                 : entryPrice * (1 - tp.pct / 100);
              
              const hit = isLong ? last.high >= targetPrice : last.low <= targetPrice;

              if (hit) {
                  // Calculate Quantity based on Initial Quantity * Percentage
                  const qtyToSell = nextPos.initialQuantity * (tp.qtyPct / 100);
                  // Ensure we don't sell more than remaining (floating point check)
                  const actualQty = Math.min(qtyToSell, nextPos.remainingQuantity);
                  const tradeValue = actualQty * currentPrice;

                  const action = isLong ? 'sell' : 'buy_to_cover'; 
                  actions.push(createPayload(action, nextPos.direction.toLowerCase(), `止盈${idx+1}触发`, tradeValue, actualQty));
                  
                  // Update State
                  nextPos.remainingQuantity = Math.max(0, nextPos.remainingQuantity - actualQty);
                  const newHits = [...nextPos.tpLevelsHit];
                  newHits[idx] = true;
                  nextPos.tpLevelsHit = newHits;
              }
          });

          // Stop Losses
          config.slLevels.forEach((sl, idx) => {
             if (!sl.active || nextPos.slLevelsHit[idx] || nextPos.remainingQuantity <= 0.000001) return;
             
             const targetPrice = isLong 
                 ? entryPrice * (1 - sl.pct / 100)
                 : entryPrice * (1 + sl.pct / 100);

             const hit = isLong ? last.low <= targetPrice : last.high >= targetPrice;

             if (hit) {
                  const qtyToSell = nextPos.initialQuantity * (sl.qtyPct / 100);
                  const actualQty = Math.min(qtyToSell, nextPos.remainingQuantity);
                  const tradeValue = actualQty * currentPrice;

                  const action = isLong ? 'sell' : 'buy_to_cover';
                  actions.push(createPayload(action, nextPos.direction.toLowerCase(), `止损${idx+1}触发`, tradeValue, actualQty));

                  nextPos.remainingQuantity = Math.max(0, nextPos.remainingQuantity - actualQty);
                  const newHits = [...nextPos.slLevelsHit];
                  newHits[idx] = true;
                  nextPos.slLevelsHit = newHits;
             }
          });
      }

      // Check if position is effectively closed by partials
      if (nextPos.remainingQuantity <= 0.000001 && !finalCloseReason) {
           finalCloseReason = "全部止盈/止损完成";
      }

      // EXECUTE FULL CLOSE (CLOSE REMAINING)
      if (finalCloseReason) {
          // If remaining quantity is near zero (already closed by MultiTPSL), we still might trigger this if logic overlaps
          // So we check > 0
          if (nextPos.remainingQuantity > 0.000001) {
             const qtyToClose = nextPos.remainingQuantity;
             const tradeValue = qtyToClose * currentPrice;
             const actionStr = isLong ? 'sell' : 'buy_to_cover';
             
             actions.push(createPayload(actionStr, 'flat', finalCloseReason, tradeValue, qtyToClose));
          }
          
          nextPos = {
            direction: 'FLAT',
            initialQuantity: 0,
            remainingQuantity: 0,
            entryPrice: 0,
            highestPrice: 0,
            lowestPrice: 0,
            openTime: 0,
            tpLevelsHit: [],
            slLevelsHit: []
          };
          nextStats.dailyTradeCount++;
          
          // REVERSE LOGIC
          const isSignalExit = (isLong && finalCloseReason === exitLongReason) || 
                               (!isLong && finalCloseReason === exitShortReason);

          if (config.useReverse && isSignalExit) {
             const newQty = config.tradeAmount / last.close;
             const tradeVal = config.tradeAmount;

             if (isLong && config.reverseLongToShort && canOpen) {
                actions.push(createPayload('sell', 'short', '反手开空', tradeVal, newQty));
                nextPos = {
                  direction: 'SHORT',
                  initialQuantity: newQty,
                  remainingQuantity: newQty,
                  entryPrice: last.close,
                  highestPrice: 0,
                  lowestPrice: last.low,
                  openTime: now.getTime(),
                  tpLevelsHit: [],
                  slLevelsHit: []
                };
             } else if (!isLong && config.reverseShortToLong && canOpen) {
                actions.push(createPayload('buy', 'long', '反手开多', tradeVal, newQty));
                nextPos = {
                  direction: 'LONG',
                  initialQuantity: newQty,
                  remainingQuantity: newQty,
                  entryPrice: last.close,
                  highestPrice: last.high,
                  lowestPrice: 0,
                  openTime: now.getTime(),
                  tpLevelsHit: [],
                  slLevelsHit: []
                };
             }
          }
          return { newPositionState: nextPos, newTradeStats: nextStats, actions };
      }
  }

  // B. Check Entries (Only if FLAT)
  if (nextPos.direction === 'FLAT' && canOpen) {
      if (longEntryReason || shortEntryReason) {
          const qty = config.tradeAmount / last.close;
          const tradeVal = config.tradeAmount;

          if (longEntryReason) {
              actions.push(createPayload('buy', 'long', longEntryReason, tradeVal, qty));
              nextPos = {
                direction: 'LONG',
                initialQuantity: qty,
                remainingQuantity: qty,
                entryPrice: last.close,
                highestPrice: last.high,
                lowestPrice: 0,
                openTime: now.getTime(),
                tpLevelsHit: [],
                slLevelsHit: []
              };
          } else if (shortEntryReason) {
              actions.push(createPayload('sell', 'short', shortEntryReason, tradeVal, qty));
              nextPos = {
                direction: 'SHORT',
                initialQuantity: qty,
                remainingQuantity: qty,
                entryPrice: last.close,
                highestPrice: 0,
                lowestPrice: last.low,
                openTime: now.getTime(),
                tpLevelsHit: [],
                slLevelsHit: []
              };
          }
      }
  }

  return { newPositionState: nextPos, newTradeStats: nextStats, actions };
};

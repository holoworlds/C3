
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Candle, StrategyConfig, AlertLog, PositionState, TradeStats, WebhookPayload, StrategyRuntime } from './types';
import { DEFAULT_CONFIG, BINANCE_WS_BASE } from './constants';
import { fetchHistoricalCandles, parseSocketMessage } from './services/binanceService';
import { enrichCandlesWithIndicators } from './services/indicatorService';
import { evaluateStrategy } from './services/strategyEngine';
import Chart from './components/Chart';
import ControlPanel from './components/ControlPanel';
import LogPanel from './components/LogPanel';

const INITIAL_POS_STATE: PositionState = {
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

const INITIAL_STATS: TradeStats = { dailyTradeCount: 0, lastTradeDate: new Date().toISOString().split('T')[0] };

const App: React.FC = () => {
  // --- Master State ---
  // Strategies state is for UI rendering
  const [strategies, setStrategies] = useState<Record<string, StrategyRuntime>>({
    [DEFAULT_CONFIG.id]: {
        config: DEFAULT_CONFIG,
        candles: [],
        positionState: INITIAL_POS_STATE,
        tradeStats: INITIAL_STATS,
        lastPrice: 0
    }
  });

  // --- Mutable Ref for High Frequency Logic ---
  // This is the Source of Truth for the Engine loop to prevent race conditions (duplicate orders)
  // caused by React state update delays.
  const latestStrategiesRef = useRef<Record<string, StrategyRuntime>>({
     [DEFAULT_CONFIG.id]: {
        config: DEFAULT_CONFIG,
        candles: [],
        positionState: INITIAL_POS_STATE,
        tradeStats: INITIAL_STATS,
        lastPrice: 0
     }
  });

  const [activeStrategyId, setActiveStrategyId] = useState<string>(DEFAULT_CONFIG.id);
  const [logs, setLogs] = useState<AlertLog[]>([]);
  
  // Resizing State
  const [logPanelHeight, setLogPanelHeight] = useState<number>(200);
  const isResizingRef = useRef(false);

  // Sync Ref with State when State is updated via manual UI actions or init
  useEffect(() => {
     // We only want to sync if the keys changed or manual overrides occurred.
     // In the websocket loop, we update Ref first, then State.
  }, [strategies]); 

  // --- Resizing Handlers ---
  const startResizing = useCallback(() => {
    isResizingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizing = useCallback(() => {
    isResizingRef.current = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current) return;
    const newHeight = window.innerHeight - e.clientY;
    // Limit height (min 100px, max 80% of screen)
    if (newHeight > 100 && newHeight < window.innerHeight * 0.8) {
        setLogPanelHeight(newHeight);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', stopResizing);
    };
  }, [handleMouseMove, stopResizing]);


  // --- Helpers to Update Strategy ---
  const updateStrategyConfig = (id: string, updates: Partial<StrategyConfig>) => {
     const oldRuntime = latestStrategiesRef.current[id];
     if (!oldRuntime) return;
     
     const newConfig = { ...oldRuntime.config, ...updates };
     
     let shouldResetData = false;
     if (updates.symbol && updates.symbol !== oldRuntime.config.symbol) shouldResetData = true;
     if (updates.interval && updates.interval !== oldRuntime.config.interval) shouldResetData = true;

     const newRuntime = {
         ...oldRuntime,
         config: newConfig,
         candles: shouldResetData ? [] : oldRuntime.candles,
         lastPrice: shouldResetData ? 0 : oldRuntime.lastPrice
     };

     // Update Ref Immediately
     latestStrategiesRef.current = {
        ...latestStrategiesRef.current,
        [id]: newRuntime
     };
     
     // Update UI
     setStrategies(latestStrategiesRef.current);
  };

  const addStrategy = () => {
     const newId = Math.random().toString(36).substr(2, 9);
     const newConfig = { ...DEFAULT_CONFIG, id: newId, name: `策略 #${Object.keys(latestStrategiesRef.current).length + 1}` };
     
     const newRuntime: StrategyRuntime = {
         config: newConfig,
         candles: [],
         positionState: INITIAL_POS_STATE,
         tradeStats: INITIAL_STATS,
         lastPrice: 0
     };

     latestStrategiesRef.current = { ...latestStrategiesRef.current, [newId]: newRuntime };
     setStrategies(latestStrategiesRef.current);
     setActiveStrategyId(newId);
  };

  const removeStrategy = (id: string) => {
     const newStrategies = { ...latestStrategiesRef.current };
     delete newStrategies[id];
     
     latestStrategiesRef.current = newStrategies;
     setStrategies(newStrategies);

     const remainingIds = Object.keys(newStrategies);
     if (remainingIds.length > 0) {
        if (activeStrategyId === id) setActiveStrategyId(remainingIds[0]);
     }
  };

  // --- Data Loading (Historical) ---
  // Use a separate effect to trigger data loading based on the Ref state checks
  useEffect(() => {
    Object.values(strategies).forEach(async (rt: StrategyRuntime) => {
       if (rt.candles.length === 0 && rt.config.symbol) {
          const data = await fetchHistoricalCandles(rt.config.symbol, rt.config.interval);
          const enriched = enrichCandlesWithIndicators(data, { 
             macdFast: rt.config.macdFast, macdSlow: rt.config.macdSlow, macdSignal: rt.config.macdSignal 
          });
          
          // Update Ref
          if (latestStrategiesRef.current[rt.config.id]) {
               latestStrategiesRef.current[rt.config.id] = {
                   ...latestStrategiesRef.current[rt.config.id],
                   candles: enriched,
                   lastPrice: enriched.length > 0 ? enriched[enriched.length-1].close : 0
               };
               // Update UI
               setStrategies({ ...latestStrategiesRef.current });
          }
       }
    });
  }, [strategies]); // Dependency on strategies is OK here as it triggers on config change resets

  // --- WebSocket Connection ---
  useEffect(() => {
    const streams = Object.values(strategies)
        .map((s: StrategyRuntime) => `${s.config.symbol.toLowerCase()}@kline_${s.config.interval}`)
        .filter((v, i, a) => a.indexOf(v) === i);

    if (streams.length === 0) return;

    const wsUrl = `${BINANCE_WS_BASE}${streams.join('/')}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log('WS Connected');
    
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.data) {
         const kline = parseSocketMessage(msg.data);
         const streamName = msg.stream;
         if (kline) processGlobalRealtimeCandle(streamName, kline);
      }
    };

    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(strategies).length, ...Object.values(strategies).map((s: StrategyRuntime) => s.config.symbol + s.config.interval)]);


  // --- Core Processing Loop ---
  const processGlobalRealtimeCandle = useCallback((streamName: string, newCandle: Candle) => {
    // 1. Read from Mutable Ref to get absolute latest state
    const currentRuntimes = latestStrategiesRef.current;
    const updates: Record<string, StrategyRuntime> = {};
    let hasUpdates = false;

    Object.values(currentRuntimes).forEach((rt: StrategyRuntime) => {
        const targetStream = `${rt.config.symbol.toLowerCase()}@kline_${rt.config.interval}`;
        if (targetStream === streamName) {
            hasUpdates = true;
            
            // 2. Update Candles
            let updatedCandles = [...rt.candles];
            const lastCandle = updatedCandles[updatedCandles.length - 1];
            
            if (lastCandle && lastCandle.time === newCandle.time) {
                updatedCandles[updatedCandles.length - 1] = newCandle;
            } else {
                updatedCandles.push(newCandle);
            }
            if (updatedCandles.length > 550) updatedCandles = updatedCandles.slice(-550);

            const enriched = enrichCandlesWithIndicators(updatedCandles, {
                macdFast: rt.config.macdFast,
                macdSlow: rt.config.macdSlow,
                macdSignal: rt.config.macdSignal
            });

            // 3. Run Engine using Mutable State (prevents race conditions)
            const result = evaluateStrategy(enriched, rt.config, rt.positionState, rt.tradeStats);

            // 4. Handle Actions
            if (result.actions.length > 0) {
               result.actions.forEach(a => sendWebhook(a, rt.config.id, rt.config.name));
            }

            // 5. Create New Runtime Object
            const newRuntime = {
                ...rt,
                candles: enriched,
                lastPrice: newCandle.close,
                positionState: result.newPositionState,
                tradeStats: result.newTradeStats
            };

            updates[rt.config.id] = newRuntime;
            // IMMEDIATELY update Ref so next tick sees new state
            latestStrategiesRef.current[rt.config.id] = newRuntime;
        }
    });

    if (hasUpdates) {
        // Sync React State for UI
        setStrategies(prev => ({ ...prev, ...updates }));
    }

  }, []);


  const sendWebhook = async (payload: WebhookPayload, strategyId: string, strategyName: string) => {
    const newLog: AlertLog = {
      id: Math.random().toString(36).substr(2, 9),
      strategyId,
      strategyName,
      timestamp: Date.now(),
      payload,
      status: 'sent',
      type: payload.tp_level === 'Manual' ? 'Manual' : 'Strategy'
    };
    setLogs(prev => [newLog, ...prev]);

    const url = latestStrategiesRef.current[strategyId]?.config.webhookUrl;

    if (url) {
      try {
        await fetch(url, {
           method: 'POST',
           mode: 'no-cors', 
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(payload)
        });
      } catch (e) {
        console.error("Webhook Error", e);
      }
    }
  };

  const handleManualOrder = (type: 'LONG' | 'SHORT' | 'FLAT') => {
      const activeStrategy = latestStrategiesRef.current[activeStrategyId];
      if (!activeStrategy) return;

      const now = new Date();
      let act = '';
      let pos = '';
      
      const price = activeStrategy.lastPrice || 0;
      let quantity = 0;
      let tradeAmount = 0;

      if (type === 'LONG') { 
          act = 'buy'; 
          pos = 'long'; 
          tradeAmount = activeStrategy.config.tradeAmount;
          quantity = price > 0 ? tradeAmount / price : 0;
      }
      if (type === 'SHORT') { 
          act = 'sell'; 
          pos = 'short'; 
          tradeAmount = activeStrategy.config.tradeAmount;
          quantity = price > 0 ? tradeAmount / price : 0;
      }
      if (type === 'FLAT') { 
          act = activeStrategy.positionState.direction === 'LONG' ? 'sell' : 'buy_to_cover'; 
          pos = 'flat'; 
          quantity = activeStrategy.positionState.remainingQuantity; // Close remaining
          tradeAmount = quantity * price; // Value of exit
      }

      const payload: WebhookPayload = {
        secret: activeStrategy.config.secret,
        action: act,
        position: pos,
        symbol: activeStrategy.config.symbol,
        trade_amount: tradeAmount,
        leverage: 5,
        timestamp: now.toISOString(),
        tv_exchange: "BINANCE",
        strategy_name: "Manual_Override",
        tp_level: "手动操作",
        execution_price: price,
        execution_quantity: quantity
      };

      // Manually update state
      let newState: PositionState = { ...activeStrategy.positionState };
      let newStats = { ...activeStrategy.tradeStats };

      if (type === 'FLAT') {
         newState = INITIAL_POS_STATE;
      } else {
         newState = {
            direction: type,
            initialQuantity: quantity,
            remainingQuantity: quantity,
            entryPrice: price,
            highestPrice: type === 'LONG' ? price : 0,
            lowestPrice: type === 'SHORT' ? price : 0,
            openTime: now.getTime(),
            tpLevelsHit: [],
            slLevelsHit: []
         };
         newStats.dailyTradeCount += 1;
      }

      const newRuntime = {
          ...activeStrategy,
          positionState: newState,
          tradeStats: newStats
      };

      latestStrategiesRef.current[activeStrategyId] = newRuntime;
      setStrategies({ ...latestStrategiesRef.current });

      sendWebhook(payload, activeStrategyId, activeStrategy.config.name);
  };

  const activeStrategy = strategies[activeStrategyId] || Object.values(strategies)[0];
  const activeStrategyLogs = logs.filter(l => l.strategyId === activeStrategyId);

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-200 overflow-hidden font-sans">
      <div className="w-80 flex-shrink-0 p-2 border-r border-slate-800">
        <ControlPanel 
           activeConfig={activeStrategy.config} 
           updateConfig={updateStrategyConfig}
           strategies={Object.values(strategies).map((s: StrategyRuntime) => s.config)}
           selectedStrategyId={activeStrategyId}
           onSelectStrategy={setActiveStrategyId}
           onAddStrategy={addStrategy}
           onRemoveStrategy={removeStrategy}
           lastPrice={activeStrategy.lastPrice} 
           onManualOrder={handleManualOrder}
           positionStatus={activeStrategy.positionState.direction}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-slate-800 flex items-center px-4 bg-slate-900 justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="font-bold bg-gradient-to-r from-blue-400 to-emerald-400 text-transparent bg-clip-text">
              加密货币量化监控 - {activeStrategy.config.name} ({activeStrategy.config.symbol})
            </h1>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
               今日交易: {activeStrategy.tradeStats.dailyTradeCount} / {activeStrategy.config.maxDailyTrades}
            </span>
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-400">
             <span className="w-2 h-2 rounded-full bg-yellow-400"></span> <span>EMA7</span>
             <span className="w-2 h-2 rounded-full bg-blue-400"></span> <span>EMA25</span>
             <span className="w-2 h-2 rounded-full bg-purple-400"></span> <span>EMA99</span>
          </div>
        </header>

        <div className="flex-1 p-2 relative flex flex-col min-h-0">
          <div className="flex-1 rounded border border-slate-800 bg-slate-900/50 shadow-inner overflow-hidden relative">
             <Chart 
                data={activeStrategy.candles} 
                logs={activeStrategyLogs}
                symbol={activeStrategy.config.symbol}
                interval={activeStrategy.config.interval}
             />
          </div>
        </div>

        {/* Resizer Handle */}
        <div 
          className="h-2 bg-slate-900 hover:bg-blue-600 cursor-row-resize flex items-center justify-center border-t border-b border-slate-800 transition-colors flex-shrink-0"
          onMouseDown={startResizing}
        >
           <div className="w-8 h-1 bg-slate-600 rounded-full"></div>
        </div>

        {/* Resizable Log Panel Container */}
        <div style={{ height: logPanelHeight }} className="flex-shrink-0 bg-slate-900 overflow-hidden">
           <LogPanel logs={logs} />
        </div>
      </div>
    </div>
  );
};

export default App;

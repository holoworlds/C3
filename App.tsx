import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { StrategyConfig, AlertLog, PositionState, TradeStats, StrategyRuntime } from './types';
import { DEFAULT_CONFIG } from './constants';
import Chart from './components/Chart';
import ControlPanel from './components/ControlPanel';
import LogPanel from './components/LogPanel';

// Use relative path (undefined) to leverage Vite proxy in dev and same-origin in prod.
// This ensures requests go through the proxy configured in vite.config.ts to localhost:3001
const SERVER_URL = undefined; 

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
const INITIAL_STATS: TradeStats = { dailyTradeCount: 0, lastTradeDate: '' };

const App: React.FC = () => {
  // Initialize with Default Strategy immediately so UI renders even if offline
  const [strategies, setStrategies] = useState<Record<string, StrategyRuntime>>({
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
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  
  // Buffer for throttling updates
  const pendingUpdatesRef = useRef<Record<string, StrategyRuntime>>({});

  // --- Socket Connection ---
  useEffect(() => {
    // Initialize Socket
    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
        console.log('Connected to Backend');
        setIsConnected(true);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from Backend');
        setIsConnected(false);
    });

    // Receive Full State (Initial load or Add/Remove strategy)
    socket.on('full_state', (data: Record<string, StrategyRuntime>) => {
        setStrategies(data);
        // If the active strategy is no longer in the list (e.g. deleted), switch to first available
        setActiveStrategyId(prevId => {
             if (!data[prevId]) {
                const keys = Object.keys(data);
                if (keys.length > 0) return keys[0];
             }
             return prevId;
        });
    });

    // Receive Incremental Updates (Tick) - Buffered
    socket.on('state_update', ({ id, runtime }: { id: string, runtime: StrategyRuntime }) => {
        pendingUpdatesRef.current[id] = runtime;
    });

    // Logs
    socket.on('logs_update', (allLogs: AlertLog[]) => {
        setLogs(allLogs);
    });

    socket.on('log_new', (log: AlertLog) => {
        setLogs(prev => [log, ...prev].slice(0, 500));
    });

    // Throttling Interval (250ms) to reduce render frequency
    const throttleInterval = setInterval(() => {
        if (Object.keys(pendingUpdatesRef.current).length > 0) {
            setStrategies(prev => {
                const updates = pendingUpdatesRef.current;
                pendingUpdatesRef.current = {}; // Clear buffer
                return { ...prev, ...updates };
            });
        }
    }, 250);

    return () => {
        clearInterval(throttleInterval);
        socket.disconnect();
    };
  }, []); // Run once

  // --- Actions ---
  const updateStrategyConfig = (id: string, updates: Partial<StrategyConfig>) => {
      // Optimistic update for UI responsiveness? No, let's wait for server ack usually, 
      // but for sliders we might want instant feedback.
      // For now, send to server.
      socketRef.current?.emit('cmd_update_config', { id, updates });
      
      // Also update local state optimistically for better UX on inputs
      setStrategies(prev => {
          if (!prev[id]) return prev;
          return {
              ...prev,
              [id]: {
                  ...prev[id],
                  config: { ...prev[id].config, ...updates }
              }
          };
      });
  };

  const addStrategy = () => {
      socketRef.current?.emit('cmd_add_strategy');
  };

  const removeStrategy = (id: string) => {
      socketRef.current?.emit('cmd_remove_strategy', id);
  };

  const handleManualOrder = (type: 'LONG' | 'SHORT' | 'FLAT') => {
      socketRef.current?.emit('cmd_manual_order', { id: activeStrategyId, type });
  };

  // Resizing State
  const [logPanelHeight, setLogPanelHeight] = useState<number>(200);
  const isResizingRef = useRef(false);
  
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


  // --- Render ---
  
  // Safe access
  const activeStrategy = strategies[activeStrategyId] || {
      config: DEFAULT_CONFIG,
      candles: [],
      positionState: INITIAL_POS_STATE,
      tradeStats: INITIAL_STATS,
      lastPrice: 0
  };

  const activeStrategyLogs = logs.filter(l => l.strategyId === activeStrategyId);

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Width increased to 340px (w-96 is 384px, or custom) to fit new layout better */}
      <div className="w-[360px] flex-shrink-0 p-2 border-r border-slate-200">
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
        <header className="h-12 border-b border-slate-200 flex items-center px-4 bg-white justify-between flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-4">
            <h1 className="font-bold bg-gradient-to-r from-blue-600 to-emerald-600 text-transparent bg-clip-text">
              加密货币量化监控 - {activeStrategy.config.name} ({activeStrategy.config.symbol})
            </h1>
            <div className={`text-xs px-2 py-0.5 rounded border ${isConnected ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-rose-100 text-rose-700 border-rose-200'}`}>
                {isConnected ? '后端在线' : '后端断开 (预览模式)'}
            </div>
            <span className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
               今日交易: {activeStrategy.tradeStats.dailyTradeCount} / {activeStrategy.config.maxDailyTrades}
            </span>
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-500">
             <span className="w-2 h-2 rounded-full bg-yellow-500"></span> <span>EMA7</span>
             <span className="w-2 h-2 rounded-full bg-blue-500"></span> <span>EMA25</span>
             <span className="w-2 h-2 rounded-full bg-purple-500"></span> <span>EMA99</span>
          </div>
        </header>

        <div className="flex-1 p-2 relative flex flex-col min-h-0">
          <div className="flex-1 rounded border border-slate-200 bg-white shadow-sm overflow-hidden relative">
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
          className="h-2 bg-slate-100 hover:bg-blue-100 cursor-row-resize flex items-center justify-center border-t border-b border-slate-200 transition-colors flex-shrink-0"
          onMouseDown={startResizing}
        >
           <div className="w-8 h-1 bg-slate-300 rounded-full"></div>
        </div>

        {/* Resizable Log Panel Container */}
        <div style={{ height: logPanelHeight }} className="flex-shrink-0 bg-white overflow-hidden">
           <LogPanel 
             logs={logs} 
             strategies={Object.values(strategies).map((s: StrategyRuntime) => ({ id: s.config.id, name: s.config.name, symbol: s.config.symbol }))}
           />
        </div>
      </div>
    </div>
  );
};

export default App;
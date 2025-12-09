
import WebSocket from 'ws';
import { StrategyConfig, StrategyRuntime, Candle, PositionState, TradeStats, WebhookPayload, IntervalType } from "../types";
import { fetchHistoricalCandles, parseSocketMessage } from "../services/binanceService";
import { enrichCandlesWithIndicators } from "../services/indicatorService";
import { evaluateStrategy } from "../services/strategyEngine";
import { BINANCE_WS_BASE } from "../constants";
import { determineBaseConfig, resampleCandles } from "../services/resampleService";

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

export class StrategyRunner {
    public runtime: StrategyRuntime;
    private ws: WebSocket | null = null;
    private pingInterval: ReturnType<typeof setInterval> | null = null;
    private isConnected: boolean = false;
    private onUpdate: (id: string, runtime: StrategyRuntime) => void;
    private onLog: (log: any) => void;

    // Resampling State
    private baseInterval: IntervalType = '1m';
    private isNativeInterval: boolean = true;
    private baseCandles: Candle[] = []; // Buffer for raw candles from Binance

    constructor(config: StrategyConfig, onUpdate: (id: string, runtime: StrategyRuntime) => void, onLog: (log: any) => void) {
        this.onUpdate = onUpdate;
        this.onLog = onLog;
        this.runtime = {
            config: config,
            candles: [],
            positionState: INITIAL_POS_STATE,
            tradeStats: INITIAL_STATS,
            lastPrice: 0
        };
    }

    public async start() {
        console.log(`[${this.runtime.config.name}] Starting...`);
        
        // 1. Determine Data Source Config (Resampling vs Native)
        const { baseInterval, isNative } = determineBaseConfig(this.runtime.config.interval);
        this.baseInterval = baseInterval;
        this.isNativeInterval = isNative;
        
        console.log(`[${this.runtime.config.name}] Mode: ${isNative ? 'Native' : 'Resample'}, Base: ${baseInterval}, Target: ${this.runtime.config.interval}`);

        // 2. Fetch Historical Data (Base Interval)
        const history = await fetchHistoricalCandles(this.runtime.config.symbol, this.baseInterval);
        
        if (this.isNativeInterval) {
            // Direct use
            this.runtime.candles = this.enrich(history);
            // We maintain baseCandles even in native mode for consistency in processCandle if we wanted,
            // but for performance, native mode can bypass resampling steps.
        } else {
            // Store raw history for resampling
            this.baseCandles = history;
            // Generate initial resampled candles
            const resampled = resampleCandles(this.baseCandles, this.runtime.config.interval, this.baseInterval);
            this.runtime.candles = this.enrich(resampled);
        }

        if (this.runtime.candles.length > 0) {
            this.runtime.lastPrice = this.runtime.candles[this.runtime.candles.length - 1].close;
        }
        
        // 3. Connect to WebSocket
        this.connectWebSocket();
    }

    public stop() {
        console.log(`[${this.runtime.config.name}] Stopping...`);
        if (this.ws) {
            this.ws.terminate();
            this.ws = null;
        }
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        this.isConnected = false;
        this.baseCandles = [];
    }

    public updateConfig(newConfig: StrategyConfig) {
        const oldSymbol = this.runtime.config.symbol;
        const oldInterval = this.runtime.config.interval;
        const wasManual = this.runtime.config.manualTakeover;
        
        this.runtime.config = newConfig;

        // CHECK MANUAL TAKEOVER TRANSITION (False -> True)
        if (!wasManual && newConfig.manualTakeover) {
             this.initializeManualPosition(newConfig);
        }

        // If symbol or interval changed, restart connection and data
        if (newConfig.symbol !== oldSymbol || newConfig.interval !== oldInterval) {
            this.stop();
            this.runtime.candles = [];
            this.start();
        } else {
            // Just trigger an update to ensure UI sees new config
            this.emitUpdate();
        }
    }

    private initializeManualPosition(config: StrategyConfig) {
        if (config.takeoverDirection === 'FLAT') {
            this.runtime.positionState = INITIAL_POS_STATE;
            console.log(`[${config.name}] Manual Takeover: Reset to FLAT`);
        } else {
            const price = this.runtime.lastPrice; // Ideally we use price at timestamp, but for now use current
            const qty = config.takeoverQuantity;
            
            this.runtime.positionState = {
                direction: config.takeoverDirection,
                initialQuantity: qty,
                remainingQuantity: qty,
                entryPrice: price,
                highestPrice: config.takeoverDirection === 'LONG' ? price : 0,
                lowestPrice: config.takeoverDirection === 'SHORT' ? price : 0,
                openTime: Date.now(), // Should parse config.takeoverTimestamp if strict
                tpLevelsHit: [],
                slLevelsHit: []
            };

            // Log this forced takeover
            const payload: WebhookPayload = {
                secret: config.secret,
                action: config.takeoverDirection === 'LONG' ? 'buy' : 'sell',
                position: config.takeoverDirection.toLowerCase(),
                symbol: config.symbol,
                trade_amount: qty * price,
                leverage: 5,
                timestamp: new Date().toISOString(),
                tv_exchange: "BINANCE",
                strategy_name: config.name,
                tp_level: "Manual_Takeover_Init",
                execution_price: price,
                execution_quantity: qty
            };
            this.sendWebhook(payload, true);
            console.log(`[${config.name}] Manual Takeover: Initialized ${config.takeoverDirection} ${qty}`);
        }
    }

    public handleManualOrder(type: 'LONG' | 'SHORT' | 'FLAT') {
        const price = this.runtime.lastPrice;
        if (price === 0) return;

        const now = new Date();
        let act = '';
        let pos = '';
        let quantity = 0;
        let tradeAmount = 0;

        if (type === 'LONG') { 
            act = 'buy'; 
            pos = 'long'; 
            tradeAmount = this.runtime.config.tradeAmount;
            quantity = tradeAmount / price;
        }
        if (type === 'SHORT') { 
            act = 'sell'; 
            pos = 'short'; 
            tradeAmount = this.runtime.config.tradeAmount;
            quantity = tradeAmount / price;
        }
        if (type === 'FLAT') { 
            act = this.runtime.positionState.direction === 'LONG' ? 'sell' : 'buy_to_cover'; 
            pos = 'flat'; 
            quantity = this.runtime.positionState.remainingQuantity; 
            tradeAmount = quantity * price; 
        }

        const payload: WebhookPayload = {
            secret: this.runtime.config.secret,
            action: act,
            position: pos,
            symbol: this.runtime.config.symbol,
            trade_amount: tradeAmount, // Keeping for compatibility if needed
            leverage: 5,
            timestamp: now.toISOString(),
            tv_exchange: "BINANCE",
            strategy_name: "Manual_Override",
            tp_level: "手动操作",
            execution_price: price,
            execution_quantity: quantity
        };

        // Update State Manually
        let newStats = { ...this.runtime.tradeStats };
        let newState: PositionState;

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

        this.runtime.positionState = newState;
        this.runtime.tradeStats = newStats;

        this.sendWebhook(payload, true);
        this.emitUpdate();
    }

    private connectWebSocket() {
        // Subscribe to BASE interval stream
        const streamName = `${this.runtime.config.symbol.toLowerCase()}@kline_${this.baseInterval}`;
        const wsUrl = `${BINANCE_WS_BASE}${streamName}`;
        
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
            console.log(`[${this.runtime.config.name}] WS Connected (${streamName})`);
            this.isConnected = true;
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.data) {
                    const kline = parseSocketMessage(msg.data);
                    if (kline) {
                        this.processCandle(kline);
                    }
                }
            } catch (e) {
                console.error(`[${this.runtime.config.name}] WS Error parsing`, e);
            }
        });

        this.ws.on('close', () => {
            console.log(`[${this.runtime.config.name}] WS Closed. Reconnecting in 5s...`);
            this.isConnected = false;
            setTimeout(() => this.start(), 5000); // Simple reconnect
        });

        this.ws.on('error', (err) => {
            console.error(`[${this.runtime.config.name}] WS Error`, err);
        });
    }

    private processCandle(newCandle: Candle) {
        this.runtime.lastPrice = newCandle.close;
        let enrichedCandles: Candle[] = [];

        if (this.isNativeInterval) {
            // NATIVE MODE
            let updatedCandles = [...this.runtime.candles];
            const lastCandle = updatedCandles[updatedCandles.length - 1];

            if (lastCandle && lastCandle.time === newCandle.time) {
                updatedCandles[updatedCandles.length - 1] = newCandle;
            } else {
                updatedCandles.push(newCandle);
            }
            if (updatedCandles.length > 550) updatedCandles = updatedCandles.slice(-550);
            
            enrichedCandles = this.enrich(updatedCandles);

        } else {
            // RESAMPLING MODE
            
            // 1. Update Base Candles
            let updatedBase = [...this.baseCandles];
            const lastBase = updatedBase[updatedBase.length - 1];
            
            if (lastBase && lastBase.time === newCandle.time) {
                updatedBase[updatedBase.length - 1] = newCandle;
            } else {
                updatedBase.push(newCandle);
            }
            
            // Limit base buffer (needs to be large enough to form enough target candles)
            // 1500 base candles roughly gives enough data.
            if (updatedBase.length > 1500) updatedBase = updatedBase.slice(-1500);
            this.baseCandles = updatedBase;

            // 2. Resample
            const resampled = resampleCandles(this.baseCandles, this.runtime.config.interval, this.baseInterval);
            
            enrichedCandles = this.enrich(resampled);
        }

        // Common Logic
        this.runtime.candles = enrichedCandles;

        // 3. Evaluate Strategy
        const result = evaluateStrategy(
            enrichedCandles, 
            this.runtime.config, 
            this.runtime.positionState, 
            this.runtime.tradeStats
        );

        // 4. Update State
        this.runtime.positionState = result.newPositionState;
        this.runtime.tradeStats = result.newTradeStats;

        // 5. Execute Actions
        if (result.actions.length > 0) {
            result.actions.forEach(action => this.sendWebhook(action));
        }

        // 6. Notify Manager
        this.emitUpdate();
    }

    private enrich(candles: Candle[]): Candle[] {
        return enrichCandlesWithIndicators(candles, {
            macdFast: this.runtime.config.macdFast,
            macdSlow: this.runtime.config.macdSlow,
            macdSignal: this.runtime.config.macdSignal
        });
    }

    private async sendWebhook(payload: WebhookPayload, isManual: boolean = false) {
        // Log it first
        const logEntry = {
            id: Math.random().toString(36).substr(2, 9),
            strategyId: this.runtime.config.id,
            strategyName: this.runtime.config.name,
            timestamp: Date.now(),
            payload,
            status: 'sent',
            type: isManual ? 'Manual' : 'Strategy'
        };
        this.onLog(logEntry);

        // Actual HTTP Request
        const url = this.runtime.config.webhookUrl;
        if (url) {
            try {
                await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                console.log(`[${this.runtime.config.name}] Webhook Sent: ${payload.action}`);
            } catch (e) {
                console.error(`[${this.runtime.config.name}] Webhook Failed`, e);
            }
        }
    }

    private emitUpdate() {
        this.onUpdate(this.runtime.config.id, this.runtime);
    }
}

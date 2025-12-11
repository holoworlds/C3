

import { StrategyConfig, StrategyRuntime, Candle, PositionState, TradeStats, WebhookPayload } from "../types";
import { enrichCandlesWithIndicators } from "../services/indicatorService";
import { evaluateStrategy } from "../services/strategyEngine";
import { dataEngine } from "./DataEngine";

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
    private onUpdate: (id: string, runtime: StrategyRuntime) => void;
    private onLog: (log: any) => void;
    private isRunning: boolean = false;
    
    // Safety ID to prevent processing stale callbacks from previous interval subscriptions
    private subscriptionId: number = 0;

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
        if (this.isRunning) return;
        
        console.log(`[${this.runtime.config.name}] Starting Strategy (Shared Engine Mode)...`);
        this.isRunning = true;

        // Increment ID to invalidate any lingering old callbacks
        this.subscriptionId++;
        const currentSid = this.subscriptionId;

        // Subscribe to Data Engine
        await dataEngine.subscribe(
            this.runtime.config.id,
            this.runtime.config.symbol,
            this.runtime.config.interval,
            (candles) => {
                // STALE DATA PROTECTION
                // If the strategy has been restarted (new ID), ignore old callbacks
                if (this.subscriptionId !== currentSid) return;
                
                this.handleDataUpdate(candles);
            }
        );
    }

    public stop() {
        console.log(`[${this.runtime.config.name}] Stopping...`);
        this.isRunning = false;
        
        // Unsubscribe from Data Engine
        dataEngine.unsubscribe(
            this.runtime.config.id, 
            this.runtime.config.symbol, 
            this.runtime.config.interval
        );
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

        // If symbol or interval changed, we need to resubscribe
        if (newConfig.symbol !== oldSymbol || newConfig.interval !== oldInterval) {
            this.stop();
            // Clear current state as context changed
            this.runtime.candles = []; 
            
            // Trigger update immediately so UI shows "Loading" state (empty candles)
            this.emitUpdate(); 
            
            this.start();
        } else {
            // Just trigger an update to ensure UI sees new config
            this.emitUpdate();
        }
    }

    public getSnapshot() {
        return {
            config: this.runtime.config,
            positionState: this.runtime.positionState,
            tradeStats: this.runtime.tradeStats
        };
    }

    public restoreState(position: PositionState, stats: TradeStats) {
        this.runtime.positionState = position;
        this.runtime.tradeStats = stats;
        console.log(`[${this.runtime.config.name}] State Restored: ${position.direction}, Today's Trades: ${stats.dailyTradeCount}`);
    }

    private initializeManualPosition(config: StrategyConfig) {
        // SAFETY FIX: Ensure defaults to prevent crash from undefined takeoverDirection
        const direction = config.takeoverDirection || 'FLAT';
        const qty = config.takeoverQuantity || 0;

        if (direction === 'FLAT') {
            this.runtime.positionState = INITIAL_POS_STATE;
            console.log(`[${config.name}] Manual Takeover: Reset to FLAT`);
        } else {
            const price = this.runtime.lastPrice; 
            
            this.runtime.positionState = {
                direction: direction,
                initialQuantity: qty,
                remainingQuantity: qty,
                entryPrice: price,
                highestPrice: direction === 'LONG' ? price : 0,
                lowestPrice: direction === 'SHORT' ? price : 0,
                openTime: Date.now(), 
                tpLevelsHit: [],
                slLevelsHit: []
            };

            const payload: WebhookPayload = {
                secret: config.secret || '',
                // Init Open Long = Buy, Init Open Short = Sell
                action: direction === 'LONG' ? 'buy' : 'sell',
                // SAFETY: Use optional chaining to prevent crash
                position: direction?.toLowerCase() || 'flat',
                symbol: config.symbol,
                quantity: qty.toString(),
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
            console.log(`[${config.name}] Manual Takeover: Initialized ${direction} ${qty}`);
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
            // FIX: If Long, Sell to close. If Short, Buy to close.
            act = this.runtime.positionState.direction === 'LONG' ? 'sell' : 'buy'; 
            pos = 'flat'; 
            quantity = this.runtime.positionState.remainingQuantity; 
            tradeAmount = quantity * price; 
        }

        const payload: WebhookPayload = {
            secret: this.runtime.config.secret || '',
            action: act,
            position: pos,
            symbol: this.runtime.config.symbol,
            quantity: quantity.toString(),
            trade_amount: tradeAmount, 
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

    // Core Logic called by Data Engine
    private handleDataUpdate(candles: Candle[]) {
        if (candles.length === 0) return;

        // --- ZERO TOLERANCE DATA IDENTITY CHECK ---
        // Ensure the data packet belongs to the correct Symbol.
        // This strictly prevents data contamination from other streams.
        const incomingSymbol = candles[0].symbol;
        if (incomingSymbol && incomingSymbol.toUpperCase() !== this.runtime.config.symbol.toUpperCase()) {
             // CRITICAL ERROR: Drop the data immediately.
             console.error(`[CRITICAL] ZERO TOLERANCE: Strategy ${this.runtime.config.name} (Config: ${this.runtime.config.symbol}) received Data for ${incomingSymbol}. IGNORING.`);
             return;
        }
        // ------------------------------------------

        // 1. Update Price
        this.runtime.lastPrice = candles[candles.length - 1].close;

        // 2. Enrich (Calculate Indicators)
        const enriched = enrichCandlesWithIndicators(candles, {
            macdFast: this.runtime.config.macdFast,
            macdSlow: this.runtime.config.macdSlow,
            macdSignal: this.runtime.config.macdSignal
        });
        
        this.runtime.candles = enriched;

        // 3. Evaluate Strategy
        const result = evaluateStrategy(
            enriched, 
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

    private async sendWebhook(payload: WebhookPayload, isManual: boolean = false) {
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

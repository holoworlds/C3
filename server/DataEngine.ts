
import WebSocket from 'ws';
import { Candle, IntervalType, SymbolType } from "../types";
import { BINANCE_WS_BASE } from "../constants";
import { fetchHistoricalCandles, parseSocketMessage } from "../services/binanceService";
import { determineBaseConfig, resampleCandles } from "../services/resampleService";
import { FileStore } from "./FileStore";

type DataCallback = (candles: Candle[]) => void;

interface Subscription {
    id: string;
    targetInterval: IntervalType;
    callback: DataCallback;
}

/**
 * StreamHandler manages a SINGLE WebSocket connection for a specific Symbol + BaseInterval.
 * It acts as the "Source of Truth" for raw data.
 * It manages multiple "Derived Streams" (Resampled data) and notifies subscribers.
 */
class StreamHandler {
    private symbol: SymbolType;
    private baseInterval: IntervalType;
    private ws: WebSocket | null = null;
    private isConnected: boolean = false;
    
    // The Source of Truth: Buffer of Base Interval Candles (e.g., 1m)
    private baseCandles: Candle[] = []; 
    
    // Cache for derived/resampled data to avoid re-calculating for every strategy
    // Key: TargetInterval (e.g. '6m'), Value: Resampled Candles
    private derivedBuffers: Map<string, Candle[]> = new Map();

    // Subscribers grouped by Target Interval
    private subscribers: Map<string, Subscription[]> = new Map();

    // Keep-Alive Mechanism
    private destroyTimeout: NodeJS.Timeout | null = null;
    private readonly KEEP_ALIVE_MS = 60000; // 60s wait before destroying stream

    // Persistence
    private lastSaveTime: number = 0;
    private readonly SAVE_INTERVAL_MS = 60000; // Save to disk every minute

    constructor(symbol: SymbolType, baseInterval: IntervalType) {
        this.symbol = symbol;
        this.baseInterval = baseInterval;
    }

    private getStoreKey(): string {
        return `${this.symbol}_${this.baseInterval}`;
    }

    public async initialize() {
        console.log(`[DataEngine] Initializing Stream: ${this.symbol} @ ${this.baseInterval}`);
        
        // 1. Try Load from Disk
        const localData = FileStore.load<Candle[]>(this.getStoreKey()) || [];
        
        if (localData.length > 0) {
            console.log(`[DataEngine] Loaded ${localData.length} candles from disk for ${this.symbol}`);
            this.baseCandles = localData;
            
            // 2. Fetch Incremental History
            const lastTime = localData[localData.length - 1].time;
            try {
                // Start from the next candle time
                const newData = await fetchHistoricalCandles(this.symbol, this.baseInterval, lastTime + 1);
                
                if (newData.length > 0) {
                    console.log(`[DataEngine] Fetched ${newData.length} new candles from API`);
                    // Merge Logic: Remove duplicates if any overlapping timestamp logic wasn't perfect
                    // Since we passed lastTime + 1, it should be fine.
                    this.baseCandles = [...this.baseCandles, ...newData];
                }
            } catch (e) {
                console.error("[DataEngine] Failed incremental fetch", e);
            }
        } else {
            // 2. Fetch Full History
            const history = await fetchHistoricalCandles(this.symbol, this.baseInterval);
            this.baseCandles = history;
        }

        // Limit buffer size (keep enough for 1D resampling if needed)
        // 1500 1m candles is 1 day. If we need more, we might need a larger buffer or different logic.
        // For now, 2000 is reasonable.
        if (this.baseCandles.length > 2000) {
            this.baseCandles = this.baseCandles.slice(-2000);
        }
        
        // Initial Save
        this.saveToDisk();

        // 3. Connect WebSocket
        this.connect();
    }

    private saveToDisk() {
        if (this.baseCandles.length === 0) return;
        FileStore.save(this.getStoreKey(), this.baseCandles);
        this.lastSaveTime = Date.now();
    }

    public subscribe(subId: string, targetInterval: IntervalType, callback: DataCallback) {
        // Cancel pending destruction if any
        if (this.destroyTimeout) {
            console.log(`[DataEngine] Resurrecting stream for ${this.symbol} (Keep-Alive hit)`);
            clearTimeout(this.destroyTimeout);
            this.destroyTimeout = null;
        }

        if (!this.subscribers.has(targetInterval)) {
            this.subscribers.set(targetInterval, []);
        }
        this.subscribers.get(targetInterval)!.push({ id: subId, targetInterval, callback });

        // IMPORTANT: Immediately send current data to the new subscriber
        // This fixes the issue of charts being empty upon initial load/switch
        const currentData = this.getOrCalculateDerivedData(targetInterval);
        callback(currentData);
    }

    public unsubscribe(subId: string) {
        for (const [interval, subs] of this.subscribers.entries()) {
            const idx = subs.findIndex(s => s.id === subId);
            if (idx !== -1) {
                subs.splice(idx, 1);
                // Clean up derived buffer if no more subscribers for this interval
                if (subs.length === 0) {
                    this.derivedBuffers.delete(interval);
                    this.subscribers.delete(interval);
                }
            }
        }
    }

    public hasSubscribers(): boolean {
        return this.subscribers.size > 0;
    }

    public scheduleDestroy(callback: () => void) {
        if (this.hasSubscribers()) return;

        console.log(`[DataEngine] Stream ${this.symbol} has no subscribers. Destroying in ${this.KEEP_ALIVE_MS / 1000}s...`);
        this.destroyTimeout = setTimeout(() => {
            // Double check before destroying
            if (!this.hasSubscribers()) {
                this.destroy();
                callback(); // Notify parent to remove from map
            }
        }, this.KEEP_ALIVE_MS);
    }

    public destroy() {
        console.log(`[DataEngine] Destroying Stream: ${this.symbol} @ ${this.baseInterval}`);
        if (this.ws) {
            this.ws.terminate();
            this.ws = null;
        }
        
        // Final Save
        this.saveToDisk();
        
        this.baseCandles = [];
        this.derivedBuffers.clear();
        this.subscribers.clear();
    }

    private connect() {
        const streamName = `${this.symbol.toLowerCase()}@kline_${this.baseInterval}`;
        const wsUrl = `${BINANCE_WS_BASE}${streamName}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
            console.log(`[DataEngine] WS Connected: ${streamName}`);
            this.isConnected = true;
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.data) {
                    const kline = parseSocketMessage(msg.data);
                    if (kline) {
                        this.processNewCandle(kline);
                    }
                }
            } catch (e) {
                console.error(`[DataEngine] Error parsing message`, e);
            }
        });

        this.ws.on('close', () => {
            console.log(`[DataEngine] WS Closed: ${streamName}`);
            this.isConnected = false;
            // Simple reconnect logic (only if still active and not pending destroy)
            if (this.hasSubscribers() && !this.destroyTimeout) {
                setTimeout(() => this.connect(), 5000);
            }
        });
        
        this.ws.on('error', (err) => {
             console.error(`[DataEngine] WS Error: ${streamName}`, err);
        });
    }

    private processNewCandle(newCandle: Candle) {
        // 1. Update Base Buffer
        const lastBase = this.baseCandles[this.baseCandles.length - 1];
        if (lastBase && lastBase.time === newCandle.time) {
            this.baseCandles[this.baseCandles.length - 1] = newCandle;
        } else {
            this.baseCandles.push(newCandle);
        }
        
        // Auto Save Periodically
        if (Date.now() - this.lastSaveTime > this.SAVE_INTERVAL_MS) {
            this.saveToDisk();
        }

        // Keep buffer size manageable
        if (this.baseCandles.length > 2000) {
            this.baseCandles = this.baseCandles.slice(-2000);
        }

        // 2. Invalidate Derived Buffers
        this.derivedBuffers.clear();

        // 3. Notify All Subscribers
        for (const [interval, subs] of this.subscribers.entries()) {
            const candles = this.getOrCalculateDerivedData(interval as IntervalType);
            subs.forEach(sub => sub.callback(candles));
        }
    }

    private getOrCalculateDerivedData(targetInterval: IntervalType): Candle[] {
        // If Base == Target (Native), return raw slice
        if (targetInterval === this.baseInterval) {
            // Return copy to prevent mutation by strategies
            return this.baseCandles.slice(-550); 
        }

        // Check Cache
        if (this.derivedBuffers.has(targetInterval)) {
            return this.derivedBuffers.get(targetInterval)!;
        }

        // Calculate
        const resampled = resampleCandles(this.baseCandles, targetInterval, this.baseInterval);
        
        // Cache it
        this.derivedBuffers.set(targetInterval, resampled);
        
        return resampled;
    }
}

/**
 * Singleton Data Engine
 * Manages all StreamHandlers.
 */
class DataEngine {
    private static instance: DataEngine;
    private streams: Map<string, StreamHandler> = new Map();

    private constructor() {}

    public static getInstance(): DataEngine {
        if (!DataEngine.instance) {
            DataEngine.instance = new DataEngine();
        }
        return DataEngine.instance;
    }

    public async subscribe(
        strategyId: string, 
        symbol: SymbolType, 
        interval: IntervalType, 
        callback: DataCallback
    ) {
        // 1. Determine Base Interval (e.g. 6m -> 3m base? or 1m base?)
        const { baseInterval } = determineBaseConfig(interval);
        
        const streamKey = `${symbol}_${baseInterval}`;

        // 2. Get or Create Stream Handler
        let stream = this.streams.get(streamKey);
        if (!stream) {
            stream = new StreamHandler(symbol, baseInterval);
            this.streams.set(streamKey, stream);
            await stream.initialize();
        }

        // 3. Subscribe
        stream.subscribe(strategyId, interval, callback);
    }

    public unsubscribe(strategyId: string, symbol: SymbolType, interval: IntervalType) {
        const { baseInterval } = determineBaseConfig(interval);
        const streamKey = `${symbol}_${baseInterval}`;
        
        const stream = this.streams.get(streamKey);
        if (stream) {
            stream.unsubscribe(strategyId);
            
            // Garbage Collection with Keep-Alive
            if (!stream.hasSubscribers()) {
                stream.scheduleDestroy(() => {
                    // Check again inside callback to be safe (though scheduleDestroy handles logic)
                    if (!stream.hasSubscribers()) {
                        this.streams.delete(streamKey);
                    }
                });
            }
        }
    }
}

export const dataEngine = DataEngine.getInstance();

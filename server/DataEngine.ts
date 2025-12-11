

import WebSocket from 'ws';
import { Candle, IntervalType, SymbolType } from "../types";
import { BINANCE_WS_BASE, AVAILABLE_INTERVALS } from "../constants";
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
 */
class StreamHandler {
    private symbol: SymbolType;
    private baseInterval: IntervalType;
    private ws: WebSocket | null = null;
    private isConnected: boolean = false;
    
    // The Source of Truth: Buffer of Base Interval Candles (e.g., 1m)
    private baseCandles: Candle[] = []; 
    
    // Cache for derived/resampled data
    private derivedBuffers: Map<string, Candle[]> = new Map();

    // Subscribers grouped by Target Interval
    private subscribers: Map<string, Subscription[]> = new Map();

    // Active Monitoring: Intervals that should be calculated even without subscribers
    private activeTargetIntervals: Set<IntervalType> = new Set();

    // Keep-Alive Mechanism
    private destroyTimeout: ReturnType<typeof setTimeout> | null = null;
    private readonly KEEP_ALIVE_MS = 60000; 

    // Persistence
    private lastSaveTime: number = 0;
    private readonly SAVE_INTERVAL_MS = 60000; 
    
    // Limits
    private readonly MAX_CANDLES = 5000; // Increased to support synthesized intervals (e.g. 1m -> 31m)

    // Always Active Flag (for pre-warmed symbols)
    public isAlwaysActive: boolean = false;

    constructor(symbol: SymbolType, baseInterval: IntervalType) {
        this.symbol = symbol;
        this.baseInterval = baseInterval;
    }

    public setAlwaysActive(active: boolean) {
        this.isAlwaysActive = active;
        if (active && this.destroyTimeout) {
            clearTimeout(this.destroyTimeout);
            this.destroyTimeout = null;
        }
    }

    public addActiveTargetInterval(interval: IntervalType) {
        this.activeTargetIntervals.add(interval);
    }

    private getStoreKey(): string {
        return `${this.symbol}_${this.baseInterval}`;
    }

    public async initialize() {
        // 1. Try Load from Disk
        let localData = FileStore.load<Candle[]>(this.getStoreKey()) || [];
        
        if (localData.length > 0) {
            // Sort to be safe
            localData.sort((a, b) => a.time - b.time);
            
            // Validate data integrity (simple check)
            if (localData.length > this.MAX_CANDLES) {
                localData = localData.slice(-this.MAX_CANDLES);
            }
            this.baseCandles = localData;

            // 2. Fetch Incremental History (Gap Filling)
            // ENHANCED: Loop to fetch ALL missing data, even if gap > 1500 candles (server down for days)
            let lastTime = localData[localData.length - 1].time;
            const now = Date.now();
            
            console.log(`[DataEngine] Resuming ${this.symbol} ${this.baseInterval}. Last candle: ${new Date(lastTime).toLocaleString()}`);

            while (true) {
                // Buffer to avoid requesting "future" data too aggressively
                if (now - lastTime < 60000 && this.baseInterval === '1m') break; 

                try {
                    // Fetch starting from next ms
                    const batch = await fetchHistoricalCandles(this.symbol, this.baseInterval, lastTime + 1);
                    
                    if (!batch || batch.length === 0) {
                        break; // No more data available
                    }

                    // Append unique candles
                    const newCandles = batch.filter(c => c.time > lastTime);
                    if (newCandles.length === 0) break;

                    console.log(`[DataEngine] ...Fetched gap batch: ${newCandles.length} candles`);
                    this.baseCandles = [...this.baseCandles, ...newCandles];
                    
                    lastTime = this.baseCandles[this.baseCandles.length - 1].time;

                    // If batch was small, we probably reached the tip
                    if (batch.length < 500) break;

                } catch (e) {
                    console.error(`[DataEngine] Error filling gap for ${this.symbol}:`, e);
                    break;
                }
            }

        } else {
            // 3. Deep Fetch (Multi-Page) for Fresh Start
            // We need enough data for derived intervals. 
            // e.g. 31m derived from 1m needs ~3100 candles for 100 bars of history.
            // Binance limit is 1500. We fetch 3 pages (~4500 candles).
            
            console.log(`[DataEngine] Deep fetching history for ${this.symbol} ${this.baseInterval}...`);
            let allFetched: Candle[] = [];
            let endTime: number | undefined = undefined; // Start with 'now'

            // Fetch up to 4 pages (4 * 1500 = 6000 candles) to ensure coverage
            for (let i = 0; i < 4; i++) {
                try {
                    const batch = await fetchHistoricalCandles(this.symbol, this.baseInterval, undefined, endTime);
                    if (batch.length === 0) break;
                    
                    allFetched = [...batch, ...allFetched]; // Prepend older data
                    
                    // Set endTime for next batch to be just before the oldest candle we just got
                    endTime = batch[0].time - 1;
                    
                    // If we got less than limit, we reached beginning of trading
                    if (batch.length < 500) break; 
                    
                } catch (e) {
                    console.error(`[DataEngine] Error during deep fetch page ${i}`, e);
                    break;
                }
            }
            
            // Deduplicate just in case
            const uniqueMap = new Map();
            allFetched.forEach(c => uniqueMap.set(c.time, c));
            this.baseCandles = Array.from(uniqueMap.values()).sort((a: any, b: any) => a.time - b.time);
            
            console.log(`[DataEngine] Initialized ${this.symbol} ${this.baseInterval} with ${this.baseCandles.length} candles.`);
        }

        // Trim to Max Limit
        if (this.baseCandles.length > this.MAX_CANDLES) {
            this.baseCandles = this.baseCandles.slice(-this.MAX_CANDLES);
        }
        
        // Initial Save
        this.saveToDisk();

        // 4. Connect WebSocket
        this.connect();
    }

    private saveToDisk() {
        if (this.baseCandles.length === 0) return;
        FileStore.save(this.getStoreKey(), this.baseCandles);
        this.lastSaveTime = Date.now();
    }

    public subscribe(subId: string, targetInterval: IntervalType, callback: DataCallback) {
        if (this.destroyTimeout) {
            clearTimeout(this.destroyTimeout);
            this.destroyTimeout = null;
        }

        if (!this.subscribers.has(targetInterval)) {
            this.subscribers.set(targetInterval, []);
        }
        this.subscribers.get(targetInterval)!.push({ id: subId, targetInterval, callback });

        // Send current data immediately
        const currentData = this.getOrCalculateDerivedData(targetInterval);
        callback(currentData);
    }

    public unsubscribe(subId: string) {
        for (const [interval, subs] of this.subscribers.entries()) {
            const idx = subs.findIndex(s => s.id === subId);
            if (idx !== -1) {
                subs.splice(idx, 1);
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
        // If marked as always active (pre-warmed), do NOT destroy.
        if (this.isAlwaysActive) {
            return;
        }

        if (this.hasSubscribers()) return;

        console.log(`[DataEngine] Stream ${this.symbol} has no subscribers. Destroying in ${this.KEEP_ALIVE_MS / 1000}s...`);
        this.destroyTimeout = setTimeout(() => {
            if (!this.hasSubscribers() && !this.isAlwaysActive) {
                this.destroy();
                callback(); 
            }
        }, this.KEEP_ALIVE_MS);
    }

    public destroy() {
        console.log(`[DataEngine] Destroying Stream: ${this.symbol} @ ${this.baseInterval}`);
        if (this.ws) {
            this.ws.terminate();
            this.ws = null;
        }
        
        this.saveToDisk();
        
        this.baseCandles = [];
        this.derivedBuffers.clear();
        this.subscribers.clear();
        this.activeTargetIntervals.clear();
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
            this.isConnected = false;
            // Reconnect if needed
            if ((this.hasSubscribers() || this.isAlwaysActive) && !this.destroyTimeout) {
                setTimeout(() => this.connect(), 5000);
            }
        });
        
        this.ws.on('error', (err) => {
             console.error(`[DataEngine] WS Error: ${streamName}`, err);
        });
    }

    private processNewCandle(newCandle: Candle) {
        const lastBase = this.baseCandles[this.baseCandles.length - 1];
        if (lastBase && lastBase.time === newCandle.time) {
            this.baseCandles[this.baseCandles.length - 1] = newCandle;
        } else {
            this.baseCandles.push(newCandle);
        }
        
        if (Date.now() - this.lastSaveTime > this.SAVE_INTERVAL_MS) {
            this.saveToDisk();
        }

        // Maintain buffer size
        if (this.baseCandles.length > this.MAX_CANDLES) {
            this.baseCandles = this.baseCandles.slice(-this.MAX_CANDLES);
        }

        // Clear derived cache as base data changed
        this.derivedBuffers.clear();

        // 1. Process Active Subscribers
        for (const [interval, subs] of this.subscribers.entries()) {
            const candles = this.getOrCalculateDerivedData(interval as IntervalType);
            subs.forEach(sub => sub.callback(candles));
        }

        // 2. Process Active Monitoring (Pre-warmed intervals without subscribers)
        // This ensures synthesis logic runs and buffers are populated/validated.
        if (this.isAlwaysActive) {
            for (const interval of this.activeTargetIntervals) {
                // If we already calculated it for subscribers, skip
                if (!this.subscribers.has(interval)) {
                    this.getOrCalculateDerivedData(interval);
                }
            }
        }
    }

    private getOrCalculateDerivedData(targetInterval: IntervalType): Candle[] {
        // Direct mapping
        if (targetInterval === this.baseInterval) {
            // Return a reasonable subset for display/calc to avoid sending 5000 candles to frontend
            return this.baseCandles.slice(-1000); 
        }

        if (this.derivedBuffers.has(targetInterval)) {
            return this.derivedBuffers.get(targetInterval)!;
        }

        const resampled = resampleCandles(this.baseCandles, targetInterval, this.baseInterval);
        
        // Ensure we don't hold too many derived candles either
        const trimmed = resampled.slice(-1000);
        
        this.derivedBuffers.set(targetInterval, trimmed);
        return trimmed;
    }
}

/**
 * Singleton Data Engine
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

    /**
     * Ensures streams are active for ALL supported intervals for a given symbol.
     * This iterates through AVAILABLE_INTERVALS and ensures the base stream exists
     * and the target interval is registered for monitoring.
     */
    public async ensureActive(symbol: SymbolType) {
         console.log(`[DataEngine] === Pre-warming ALL cycles for ${symbol} ===`);
         
         // Iterate through all supported intervals to ensure comprehensive coverage
         for (const interval of AVAILABLE_INTERVALS) {
             const { baseInterval, isNative } = determineBaseConfig(interval);
             
             // Log the routing decision as per system requirements
             if (isNative) {
                console.log(`[DataEngine] Routing ${symbol} ${interval.padEnd(4)} -> Native Stream`);
             } else {
                console.log(`[DataEngine] Routing ${symbol} ${interval.padEnd(4)} -> Synthesizing from ${baseInterval}`);
             }

             const streamKey = `${symbol}_${baseInterval}`;

             let stream = this.streams.get(streamKey);
             if (!stream) {
                stream = new StreamHandler(symbol, baseInterval);
                this.streams.set(streamKey, stream);
                // We initialize asynchronously to avoid blocking loop, but track promise if needed
                stream.initialize().catch(e => console.error(`[DataEngine] Failed to init stream ${streamKey}`, e));
             }

             // Mark as Always Active to prevent GC
             stream.setAlwaysActive(true);
             
             // Register this interval as a target for active synthesis/monitoring
             stream.addActiveTargetInterval(interval);
         }
         console.log(`[DataEngine] === Completed setup for ${symbol} ===\n`);
    }

    public async subscribe(
        strategyId: string, 
        symbol: SymbolType, 
        interval: IntervalType, 
        callback: DataCallback
    ) {
        const { baseInterval } = determineBaseConfig(interval);
        const streamKey = `${symbol}_${baseInterval}`;

        let stream = this.streams.get(streamKey);
        if (!stream) {
            stream = new StreamHandler(symbol, baseInterval);
            this.streams.set(streamKey, stream);
            await stream.initialize();
        }

        stream.subscribe(strategyId, interval, callback);
    }

    public unsubscribe(strategyId: string, symbol: SymbolType, interval: IntervalType) {
        const { baseInterval } = determineBaseConfig(interval);
        const streamKey = `${symbol}_${baseInterval}`;
        
        const stream = this.streams.get(streamKey);
        if (stream) {
            stream.unsubscribe(strategyId);
            
            stream.scheduleDestroy(() => {
                if (!stream.hasSubscribers() && !stream.isAlwaysActive) {
                    this.streams.delete(streamKey);
                }
            });
        }
    }
}

export const dataEngine = DataEngine.getInstance();

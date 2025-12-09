
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { StrategyRunner } from './StrategyRunner';
import { DEFAULT_CONFIG } from '../constants';
import { StrategyConfig, StrategyRuntime } from '../types';
import { FileStore } from './FileStore';

const app = express();
app.use(cors() as any);
app.use(express.json() as any);

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const PORT = 3001;

// --- Server State ---
const strategies: Record<string, StrategyRunner> = {};
let logs: any[] = [];

// --- Persistence Helpers ---
function saveSystemState() {
    try {
        const validStrategies = Object.values(strategies).filter(s => s && typeof s.getSnapshot === 'function');
        const strategySnapshots = validStrategies.map(s => s.getSnapshot());
        
        if (strategySnapshots.length > 0) {
            FileStore.save('strategies', strategySnapshots);
        }
        FileStore.save('logs', logs);
    } catch (e) {
        console.error('[System] Error saving state:', e);
    }
}

// --- Initialization with Recovery ---
async function initializeSystem() {
    console.log('[System] Initializing...');

    // 1. Restore Logs
    const savedLogs = FileStore.load<any[]>('logs');
    if (savedLogs && Array.isArray(savedLogs)) {
        logs = savedLogs;
        console.log(`[System] Restored ${logs.length} historical logs.`);
    }

    // 2. Restore Strategies
    const savedSnapshots = FileStore.load<any[]>('strategies');
    if (savedSnapshots && Array.isArray(savedSnapshots) && savedSnapshots.length > 0) {
        console.log(`[System] Restoring ${savedSnapshots.length} strategies from disk...`);
        
        for (const snapshot of savedSnapshots) {
            try {
                // Re-create Runner
                const runner = new StrategyRunner(
                    snapshot.config,
                    (id, runtime) => {
                        broadcastUpdate(id, runtime);
                    },
                    (log) => {
                        addLog(log);
                        saveSystemState(); // Save on new log
                    }
                );

                // Restore Internal State
                if (snapshot.positionState && snapshot.tradeStats) {
                    runner.restoreState(snapshot.positionState, snapshot.tradeStats);
                }

                strategies[snapshot.config.id] = runner;
                await runner.start();
            } catch (err) {
                console.error(`[System] Failed to restore strategy ${snapshot?.config?.id}:`, err);
            }
        }
    } else {
        console.log('[System] No saved state found. Starting default strategy.');
        // Default Start
        const defaultRunner = new StrategyRunner(
            DEFAULT_CONFIG, 
            (id, runtime) => broadcastUpdate(id, runtime),
            (log) => {
                addLog(log);
                saveSystemState();
            }
        );
        strategies[DEFAULT_CONFIG.id] = defaultRunner;
        defaultRunner.start();
    }
}

// --- Helper Functions ---

function broadcastUpdate(id: string, runtime: StrategyRuntime) {
    io.emit('state_update', { id, runtime });
}

function broadcastFullState(socketId?: string) {
    const fullState: Record<string, StrategyRuntime> = {};
    Object.keys(strategies).forEach(id => {
        if (strategies[id]) {
            fullState[id] = strategies[id].runtime;
        }
    });
    
    if (socketId) {
        io.to(socketId).emit('full_state', fullState);
        io.to(socketId).emit('logs_update', logs);
    } else {
        io.emit('full_state', fullState);
    }
}

function addLog(log: any) {
    logs = [log, ...logs].slice(0, 500); // Keep last 500
    io.emit('log_new', log);
}

// --- Socket.io Handlers ---

io.on('connection', (socket) => {
    console.log('Frontend Connected:', socket.id);

    // Send initial data
    broadcastFullState(socket.id);

    // Frontend requests to update config
    socket.on('cmd_update_config', ({ id, updates }: { id: string, updates: Partial<StrategyConfig> }) => {
        const runner = strategies[id];
        if (runner) {
            const newConfig = { ...runner.runtime.config, ...updates };
            runner.updateConfig(newConfig);
            saveSystemState(); // Save on config change
            console.log(`Updated config for ${id}`);
        }
    });

    // Frontend requests to add new strategy
    socket.on('cmd_add_strategy', () => {
        const newId = Math.random().toString(36).substr(2, 9);
        const newConfig = { ...DEFAULT_CONFIG, id: newId, name: `策略 #${Object.keys(strategies).length + 1}` };
        
        const newRunner = new StrategyRunner(
            newConfig,
            (id, runtime) => broadcastUpdate(id, runtime),
            (log) => {
                addLog(log);
                saveSystemState();
            }
        );
        strategies[newId] = newRunner;
        newRunner.start();
        saveSystemState(); // Save on creation
        
        broadcastFullState();
    });

    // Frontend requests to remove strategy
    socket.on('cmd_remove_strategy', (id: string) => {
        if (strategies[id]) {
            strategies[id].stop();
            delete strategies[id];
            saveSystemState(); // Save on deletion
            broadcastFullState();
        }
    });

    // Manual Orders
    socket.on('cmd_manual_order', ({ id, type }: { id: string, type: 'LONG'|'SHORT'|'FLAT' }) => {
        if (strategies[id]) {
            strategies[id].handleManualOrder(type);
            saveSystemState(); // Save on manual order
        }
    });
});

// Periodic Save (Safety Net)
setInterval(() => {
    saveSystemState();
}, 5000); // Save every 5 seconds

// Start Server
initializeSystem().then(() => {
    server.listen(PORT, () => {
        console.log(`Backend Strategy Server running on port ${PORT}`);
    });
});

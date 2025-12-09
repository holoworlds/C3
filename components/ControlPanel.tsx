
import React, { useState } from 'react';
import { StrategyConfig } from '../types';
import { AVAILABLE_SYMBOLS, AVAILABLE_INTERVALS } from '../constants';

interface ControlPanelProps {
  activeConfig: StrategyConfig;
  updateConfig: (id: string, updates: Partial<StrategyConfig>) => void;
  strategies: StrategyConfig[];
  selectedStrategyId: string;
  onSelectStrategy: (id: string) => void;
  onAddStrategy: () => void;
  onRemoveStrategy: (id: string) => void;
  lastPrice: number;
  onManualOrder: (type: 'LONG' | 'SHORT' | 'FLAT') => void;
  positionStatus: string;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ 
  activeConfig, 
  updateConfig, 
  strategies,
  selectedStrategyId,
  onSelectStrategy,
  onAddStrategy,
  onRemoveStrategy,
  lastPrice, 
  onManualOrder, 
  positionStatus 
}) => {
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'config'>('dashboard');

  const handleChange = (key: keyof StrategyConfig, value: any) => {
    updateConfig(activeConfig.id, { [key]: value });
  };

  const handleArrayChange = (arrayKey: 'tpLevels' | 'slLevels', index: number, field: string, value: any) => {
      const newArray = [...activeConfig[arrayKey]];
      newArray[index] = { ...newArray[index], [field]: value };
      updateConfig(activeConfig.id, { [arrayKey]: newArray });
  };

  const getStatusText = (status: string) => {
    if (status === 'LONG') return '多头持仓';
    if (status === 'SHORT') return '空头持仓';
    return '空仓 (Flat)';
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 h-full flex shadow-sm overflow-hidden">
        
        {/* SIDEBAR STRIP */}
        <div className="w-12 bg-slate-100 border-r border-slate-200 flex flex-col items-center py-4 gap-4 flex-shrink-0">
            {/* Tab 1: Dashboard (List + Basic) */}
            <button 
                onClick={() => setActiveTab('dashboard')}
                className={`p-2 rounded-lg transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-600'}`}
                title="概览 & 基础"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
            </button>

            {/* Tab 2: Settings (Manual, Signal, Exit, Risk) */}
            <button 
                onClick={() => setActiveTab('config')}
                className={`p-2 rounded-lg transition-all ${activeTab === 'config' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-600'}`}
                title="配置 & 管理"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            </button>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50 p-4">
            
            {/* VIEW 1: DASHBOARD */}
            {activeTab === 'dashboard' && (
                <div className="space-y-6">
                    {/* Strategy List */}
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-3">
                            <h2 className="text-slate-800 font-bold text-sm">策略列表</h2>
                            <button onClick={onAddStrategy} className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs shadow-sm transition-colors">+ 新增</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                            {strategies.map(s => (
                                <div 
                                key={s.id} 
                                onClick={() => onSelectStrategy(s.id)}
                                className={`border p-2 rounded cursor-pointer relative transition-all ${selectedStrategyId === s.id ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                >
                                <div className="font-bold text-xs truncate text-slate-800">{s.name}</div>
                                <div className="text-[10px] text-slate-500">{s.symbol} {s.interval}</div>
                                <div className="flex justify-between items-center mt-1">
                                    <div className={`w-2 h-2 rounded-full ${s.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                    {strategies.length > 1 && selectedStrategyId === s.id && (
                                        <button onClick={(e) => { e.stopPropagation(); onRemoveStrategy(s.id); }} className="text-rose-500 text-[10px] hover:text-rose-600 font-medium">删除</button>
                                    )}
                                </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Active Status & Position */}
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-3">
                         <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                             <span className="text-xs text-slate-600 font-bold">策略运行开关</span>
                             <Toggle checked={activeConfig.isActive} onChange={(v: boolean) => handleChange('isActive', v)} size="sm" />
                         </div>
                         <div className="flex justify-between items-center">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">当前持仓 ({activeConfig.symbol})</div>
                                <div className={`text-sm font-bold ${positionStatus === 'FLAT' ? 'text-slate-400' : positionStatus === 'LONG' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {getStatusText(positionStatus)}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-slate-500 mb-1">最新价格</div>
                                <div className="text-sm font-mono text-slate-900 font-bold">${lastPrice.toFixed(2)}</div>
                            </div>
                         </div>
                    </div>

                    {/* Market Settings */}
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">市场 & 基础设置</h3>
                        <div className="space-y-3">
                            <Input label="策略名称" value={activeConfig.name} onChange={(v: string) => handleChange('name', v)} />
                            <div>
                                <label className="block text-slate-600 text-xs mb-1 font-medium">交易对</label>
                                <input 
                                list="symbols" 
                                value={activeConfig.symbol} 
                                onChange={(e) => handleChange('symbol', e.target.value.toUpperCase())}
                                className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-900 focus:border-blue-500 outline-none shadow-sm"
                                placeholder="如 BTCUSDT"
                                />
                                <datalist id="symbols">
                                {AVAILABLE_SYMBOLS.map(s => <option key={s} value={s} />)}
                                </datalist>
                            </div>
                            <Select label="K线周期" value={activeConfig.interval} options={AVAILABLE_INTERVALS} onChange={(v: string) => handleChange('interval', v)} />
                            <Input label="开仓金额 (USDT)" type="number" value={activeConfig.tradeAmount} onChange={(v: string) => handleChange('tradeAmount', parseFloat(v))} />
                        </div>
                    </div>
                </div>
            )}


            {/* VIEW 2: CONFIGURATION (Flat List) */}
            {activeTab === 'config' && (
                <div className="space-y-6 pb-10">
                    
                    {/* MANUAL TAKEOVER */}
                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-200 shadow-sm">
                        <div className="flex justify-between items-center mb-3 border-b border-orange-200 pb-2">
                            <h3 className="text-sm font-bold text-orange-700">手动接管 (Manual Takeover)</h3>
                            <Toggle checked={activeConfig.manualTakeover} onChange={(v: boolean) => handleChange('manualTakeover', v)} />
                        </div>
                        <p className="text-[10px] text-orange-600 mb-3">
                            开启后，屏蔽自动开仓信号。系统将基于下方配置初始化仓位状态，并自动管理平仓逻辑。
                        </p>
                        <div className="space-y-3 bg-white p-3 rounded border border-orange-100">
                             <Select 
                                label="持仓方向" 
                                value={activeConfig.takeoverDirection} 
                                options={['FLAT', 'LONG', 'SHORT']} 
                                onChange={(v: string) => handleChange('takeoverDirection', v)} 
                             />
                             <Input 
                                label="持仓数量" 
                                type="number" 
                                value={activeConfig.takeoverQuantity} 
                                onChange={(v: string) => handleChange('takeoverQuantity', parseFloat(v))} 
                             />
                             <Input 
                                label="开仓时间 (可选)" 
                                type="datetime-local" 
                                value={activeConfig.takeoverTimestamp} 
                                onChange={(v: string) => handleChange('takeoverTimestamp', v)} 
                                placeholder="YYYY-MM-DD HH:mm:ss"
                             />
                        </div>
                    </div>

                    {/* SIGNAL CONFIGURATION */}
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">信号配置</h3>
                        
                        <div className="space-y-4">
                            {/* Trigger Mode */}
                            <div className="flex justify-between items-center bg-slate-50 p-2 rounded">
                                <span className="text-xs font-bold text-slate-700">触发模式</span>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] ${!activeConfig.triggerOnClose ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>盘中实时</span>
                                    <Toggle checked={activeConfig.triggerOnClose} onChange={(v: boolean) => handleChange('triggerOnClose', v)} size="sm" />
                                    <span className={`text-[10px] ${activeConfig.triggerOnClose ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>K线收盘</span>
                                </div>
                            </div>

                            {/* Trend Filter */}
                            <div className="space-y-2">
                                <div className="text-xs font-bold text-slate-600">趋势过滤</div>
                                <Toggle label="多头趋势 (7>25>99) 不开空" checked={activeConfig.trendFilterBlockShort} onChange={(v: boolean) => handleChange('trendFilterBlockShort', v)} size="sm" className="bg-slate-50 p-2 rounded"/>
                                <Toggle label="空头趋势 (7<25<99) 不开多" checked={activeConfig.trendFilterBlockLong} onChange={(v: boolean) => handleChange('trendFilterBlockLong', v)} size="sm" className="bg-slate-50 p-2 rounded"/>
                            </div>

                            {/* MACD */}
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="启用 MACD" checked={activeConfig.useMACD} onChange={(v: boolean) => handleChange('useMACD', v)} className="mb-2 font-bold text-slate-800"/>
                                {activeConfig.useMACD && (
                                    <div className="space-y-2 mt-2 border-t border-slate-200 pt-2">
                                        <div className="grid grid-cols-3 gap-2">
                                            <Input label="Fast" type="number" value={activeConfig.macdFast} onChange={(v: string) => handleChange('macdFast', parseFloat(v))} />
                                            <Input label="Slow" type="number" value={activeConfig.macdSlow} onChange={(v: string) => handleChange('macdSlow', parseFloat(v))} />
                                            <Input label="Sig" type="number" value={activeConfig.macdSignal} onChange={(v: string) => handleChange('macdSignal', parseFloat(v))} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 mt-1">
                                            <Toggle label="金叉开多" checked={activeConfig.macdLong} onChange={(v: boolean) => handleChange('macdLong', v)} size="sm" />
                                            <Toggle label="死叉开空" checked={activeConfig.macdShort} onChange={(v: boolean) => handleChange('macdShort', v)} size="sm" />
                                            <Toggle label="金叉平空" checked={activeConfig.macdExitShort} onChange={(v: boolean) => handleChange('macdExitShort', v)} size="sm" />
                                            <Toggle label="死叉平多" checked={activeConfig.macdExitLong} onChange={(v: boolean) => handleChange('macdExitLong', v)} size="sm" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* EMA 7/25 */}
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="启用 EMA 7/25" checked={activeConfig.useEMA7_25} onChange={(v: boolean) => handleChange('useEMA7_25', v)} className="mb-2 font-bold text-blue-600"/>
                                {activeConfig.useEMA7_25 && (
                                    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                        <Toggle label="上穿开多" checked={activeConfig.ema7_25_Long} onChange={(v: boolean) => handleChange('ema7_25_Long', v)} size="sm" />
                                        <Toggle label="下穿开空" checked={activeConfig.ema7_25_Short} onChange={(v: boolean) => handleChange('ema7_25_Short', v)} size="sm" />
                                        <Toggle label="下穿平多" checked={activeConfig.ema7_25_ExitLong} onChange={(v: boolean) => handleChange('ema7_25_ExitLong', v)} size="sm" />
                                        <Toggle label="上穿平空" checked={activeConfig.ema7_25_ExitShort} onChange={(v: boolean) => handleChange('ema7_25_ExitShort', v)} size="sm" />
                                    </div>
                                )}
                            </div>

                            {/* EMA 7/99 */}
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="启用 EMA 7/99" checked={activeConfig.useEMA7_99} onChange={(v: boolean) => handleChange('useEMA7_99', v)} className="mb-2 font-bold text-purple-600"/>
                                {activeConfig.useEMA7_99 && (
                                    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                        <Toggle label="上穿开多" checked={activeConfig.ema7_99_Long} onChange={(v: boolean) => handleChange('ema7_99_Long', v)} size="sm" />
                                        <Toggle label="下穿开空" checked={activeConfig.ema7_99_Short} onChange={(v: boolean) => handleChange('ema7_99_Short', v)} size="sm" />
                                        <Toggle label="下穿平多" checked={activeConfig.ema7_99_ExitLong} onChange={(v: boolean) => handleChange('ema7_99_ExitLong', v)} size="sm" />
                                        <Toggle label="上穿平空" checked={activeConfig.ema7_99_ExitShort} onChange={(v: boolean) => handleChange('ema7_99_ExitShort', v)} size="sm" />
                                    </div>
                                )}
                            </div>

                            {/* EMA 25/99 */}
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="启用 EMA 25/99" checked={activeConfig.useEMA25_99} onChange={(v: boolean) => handleChange('useEMA25_99', v)} className="mb-2 font-bold text-indigo-600"/>
                                {activeConfig.useEMA25_99 && (
                                    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                        <Toggle label="上穿开多" checked={activeConfig.ema25_99_Long} onChange={(v: boolean) => handleChange('ema25_99_Long', v)} size="sm" />
                                        <Toggle label="下穿开空" checked={activeConfig.ema25_99_Short} onChange={(v: boolean) => handleChange('ema25_99_Short', v)} size="sm" />
                                        <Toggle label="下穿平多" checked={activeConfig.ema25_99_ExitLong} onChange={(v: boolean) => handleChange('ema25_99_ExitLong', v)} size="sm" />
                                        <Toggle label="上穿平空" checked={activeConfig.ema25_99_ExitShort} onChange={(v: boolean) => handleChange('ema25_99_ExitShort', v)} size="sm" />
                                    </div>
                                )}
                            </div>

                            {/* EMA Double */}
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="启用 EMA 7/25 vs 99" checked={activeConfig.useEMADouble} onChange={(v: boolean) => handleChange('useEMADouble', v)} className="mb-2 font-bold text-amber-600"/>
                                {activeConfig.useEMADouble && (
                                    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                        <Toggle label="7/25上穿99 开多" checked={activeConfig.emaDoubleLong} onChange={(v: boolean) => handleChange('emaDoubleLong', v)} size="sm" />
                                        <Toggle label="7/25下穿99 开空" checked={activeConfig.emaDoubleShort} onChange={(v: boolean) => handleChange('emaDoubleShort', v)} size="sm" />
                                        <Toggle label="7/25下穿99 平多" checked={activeConfig.emaDoubleExitLong} onChange={(v: boolean) => handleChange('emaDoubleExitLong', v)} size="sm" />
                                        <Toggle label="7/25上穿99 平空" checked={activeConfig.emaDoubleExitShort} onChange={(v: boolean) => handleChange('emaDoubleExitShort', v)} size="sm" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* EXIT MANAGEMENT */}
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">出场管理</h3>
                        <div className="space-y-3">
                            {/* Trailing Stop */}
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="追踪止盈" checked={activeConfig.useTrailingStop} onChange={(v: boolean) => handleChange('useTrailingStop', v)} className="font-bold mb-2 text-slate-800" />
                                {activeConfig.useTrailingStop && (
                                    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                        <Input label="激活比例 %" type="number" value={activeConfig.trailActivation} onChange={(v: string) => handleChange('trailActivation', parseFloat(v))} />
                                        <Input label="回撤距离 %" type="number" value={activeConfig.trailDistance} onChange={(v: string) => handleChange('trailDistance', parseFloat(v))} />
                                    </div>
                                )}
                            </div>

                            {/* Fixed TP/SL */}
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="固定止盈止损" checked={activeConfig.useFixedTPSL} onChange={(v: boolean) => handleChange('useFixedTPSL', v)} className="font-bold mb-2 text-slate-800" />
                                {activeConfig.useFixedTPSL && (
                                    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                        <Input label="止盈 %" type="number" value={activeConfig.takeProfitPct} onChange={(v: string) => handleChange('takeProfitPct', parseFloat(v))} />
                                        <Input label="止损 %" type="number" value={activeConfig.stopLossPct} onChange={(v: string) => handleChange('stopLossPct', parseFloat(v))} />
                                    </div>
                                )}
                            </div>

                            {/* Multi-Level TP/SL */}
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="多级止盈止损" checked={activeConfig.useMultiTPSL} onChange={(v: boolean) => handleChange('useMultiTPSL', v)} className="font-bold mb-2 text-slate-800" />
                                {activeConfig.useMultiTPSL && (
                                    <div className="space-y-3 mt-2 border-t border-slate-200 pt-2">
                                        <div>
                                            <div className="text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">分批止盈</div>
                                            {activeConfig.tpLevels.map((tp, idx) => (
                                            <div key={`tp-${idx}`} className="flex items-end gap-2 mb-2">
                                                <div className="pb-2"><Toggle checked={tp.active} onChange={(v: boolean) => handleArrayChange('tpLevels', idx, 'active', v)} size="sm"/></div>
                                                <div className="flex-1"><Input label={`止盈${idx+1} %`} value={tp.pct} onChange={(v: string) => handleArrayChange('tpLevels', idx, 'pct', parseFloat(v))} type="number" /></div>
                                                <div className="flex-1"><Input label={`仓位 %`} value={tp.qtyPct} onChange={(v: string) => handleArrayChange('tpLevels', idx, 'qtyPct', parseFloat(v))} type="number" /></div>
                                            </div>
                                            ))}
                                        </div>
                                        <div className="border-t border-slate-200 pt-2">
                                            <div className="text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">分批止损</div>
                                            {activeConfig.slLevels.map((sl, idx) => (
                                            <div key={`sl-${idx}`} className="flex items-end gap-2 mb-2">
                                                <div className="pb-2"><Toggle checked={sl.active} onChange={(v: boolean) => handleArrayChange('slLevels', idx, 'active', v)} size="sm"/></div>
                                                <div className="flex-1"><Input label={`止损${idx+1} %`} value={sl.pct} onChange={(v: string) => handleArrayChange('slLevels', idx, 'pct', parseFloat(v))} type="number" /></div>
                                                <div className="flex-1"><Input label={`仓位 %`} value={sl.qtyPct} onChange={(v: string) => handleArrayChange('slLevels', idx, 'qtyPct', parseFloat(v))} type="number" /></div>
                                            </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Reverse */}
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="反手策略 (Stop & Reverse)" checked={activeConfig.useReverse} onChange={(v: boolean) => handleChange('useReverse', v)} className="font-bold mb-2 text-slate-800" />
                                {activeConfig.useReverse && (
                                    <div className="space-y-1 mt-1 border-t border-slate-200 pt-1">
                                        <Toggle label="多转空" checked={activeConfig.reverseLongToShort} onChange={(v: boolean) => handleChange('reverseLongToShort', v)} size="sm"/>
                                        <Toggle label="空转多" checked={activeConfig.reverseShortToLong} onChange={(v: boolean) => handleChange('reverseShortToLong', v)} size="sm"/>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* RISK CONFIGURATION */}
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">风控 & 限制</h3>
                        <Input label="每日最大交易次数" type="number" value={activeConfig.maxDailyTrades} onChange={(v: string) => handleChange('maxDailyTrades', parseFloat(v))} />
                    </div>

                </div>
            )}
        </div>
    </div>
  );
};

// --- Reusable UI Components ---

const Input = ({ label, value, onChange, type = "text", placeholder }: any) => (
  <div className="mb-2">
    <label className="block text-slate-600 text-xs mb-1 font-medium">{label}</label>
    <input 
      type={type} 
      value={value} 
      onChange={(e) => onChange(e.target.value)} 
      placeholder={placeholder}
      className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-900 focus:border-blue-500 outline-none shadow-sm"
    />
  </div>
);

const Select = ({ label, value, options, onChange }: any) => (
  <div className="mb-2">
    <label className="block text-slate-600 text-xs mb-1 font-medium">{label}</label>
    <select 
      value={value} 
      onChange={(e) => onChange(e.target.value)} 
      className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-900 focus:border-blue-500 outline-none shadow-sm"
    >
      {options.map((o: any) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const Toggle = ({ label, checked, onChange, size = "md", className = "" }: any) => (
  <div className={`flex items-center justify-between ${className}`}>
    <span className={`text-slate-700 font-medium ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>{label}</span>
    <button 
      onClick={() => onChange(!checked)}
      className={`relative inline-flex items-center rounded-full transition-colors shadow-inner ${checked ? 'bg-blue-600' : 'bg-slate-300'} ${size === 'sm' ? 'h-4 w-8' : 'h-6 w-11'}`}
    >
      <span className={`inline-block transform rounded-full bg-white transition-transform shadow-sm ${size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} ${checked ? (size === 'sm' ? 'translate-x-4' : 'translate-x-6') : 'translate-x-1'}`} />
    </button>
  </div>
);

export default ControlPanel;

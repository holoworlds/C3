
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
  
  const handleChange = (key: keyof StrategyConfig, value: any) => {
    updateConfig(activeConfig.id, { [key]: value });
  };

  const handleArrayChange = (arrayKey: 'tpLevels' | 'slLevels', index: number, field: string, value: any) => {
      const newArray = [...activeConfig[arrayKey]];
      newArray[index] = { ...newArray[index], [field]: value };
      updateConfig(activeConfig.id, { [arrayKey]: newArray });
  };

  const [openSection, setOpenSection] = useState<string>('market');

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? '' : section);
  };

  const getStatusText = (status: string) => {
    if (status === 'LONG') return '多头持仓';
    if (status === 'SHORT') return '空头持仓';
    return '空仓 (Flat)';
  }

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 h-full flex flex-col">
      {/* Strategy List Tiled View */}
      <div className="p-3 bg-slate-900 border-b border-slate-700">
         <div className="flex justify-between items-center mb-2">
            <h2 className="text-white font-bold text-sm">策略列表</h2>
            <button onClick={onAddStrategy} className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs">+ 新增</button>
         </div>
         <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto custom-scrollbar mb-2">
             {strategies.map(s => (
                <div 
                  key={s.id} 
                  onClick={() => onSelectStrategy(s.id)}
                  className={`border p-2 rounded cursor-pointer relative ${selectedStrategyId === s.id ? 'border-blue-500 bg-slate-800' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'}`}
                >
                   <div className="font-bold text-xs truncate text-slate-200">{s.name}</div>
                   <div className="text-[10px] text-slate-400">{s.symbol} {s.interval}</div>
                   <div className="flex justify-between items-center mt-1">
                      <div className={`w-2 h-2 rounded-full ${s.isActive ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>
                      {strategies.length > 1 && selectedStrategyId === s.id && (
                          <button onClick={(e) => { e.stopPropagation(); onRemoveStrategy(s.id); }} className="text-rose-500 text-[10px] hover:text-rose-400">删除</button>
                      )}
                   </div>
                </div>
             ))}
         </div>
         
         {/* Active Strategy Main Toggle */}
         <div className="flex items-center justify-between bg-slate-800 p-2 rounded">
             <span className="text-xs text-slate-400">当前策略状态</span>
             <Toggle checked={activeConfig.isActive} onChange={(v: boolean) => handleChange('isActive', v)} size="sm" />
         </div>
      </div>

      <div className="p-4 border-b border-slate-700 bg-slate-900/50">
         <div className="flex justify-between items-center bg-slate-800 p-2 rounded">
            <div>
              <div className="text-xs text-slate-400">当前持仓 ({activeConfig.symbol})</div>
              <div className={`text-sm font-bold ${positionStatus === 'FLAT' ? 'text-slate-500' : positionStatus === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {getStatusText(positionStatus)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">最新价格</div>
              <div className="text-sm font-mono text-white">${lastPrice.toFixed(2)}</div>
            </div>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Section 1: Market & Basic */}
        <Accordion title="市场 & 基础设置" isOpen={openSection === 'market'} onClick={() => toggleSection('market')}>
            <div className="space-y-3">
              <Input label="策略名称" value={activeConfig.name} onChange={(v: string) => handleChange('name', v)} />
              <div>
                <label className="block text-slate-400 text-xs mb-1">交易对 (可手动输入)</label>
                <input 
                  list="symbols" 
                  value={activeConfig.symbol} 
                  onChange={(e) => handleChange('symbol', e.target.value.toUpperCase())}
                  className="w-full bg-slate-900 border border-slate-600 rounded p-1.5 text-xs text-white focus:border-blue-500 outline-none"
                  placeholder="如 BTCUSDT"
                />
                <datalist id="symbols">
                  {AVAILABLE_SYMBOLS.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <Select label="K线周期" value={activeConfig.interval} options={AVAILABLE_INTERVALS} onChange={(v: string) => handleChange('interval', v)} />
              <Input label="开仓金额 (USDT)" type="number" value={activeConfig.tradeAmount} onChange={(v: string) => handleChange('tradeAmount', parseFloat(v))} />
              <Input label="Webhook 地址" value={activeConfig.webhookUrl} onChange={(v: string) => handleChange('webhookUrl', v)} placeholder="https://..." />
              <Input label="密钥 (Secret)" value={activeConfig.secret} onChange={(v: string) => handleChange('secret', v)} placeholder="Secret Key" />
            </div>
        </Accordion>

        {/* Section 2: Manual Control */}
        <Accordion title="手动接管 (Manual Takeover)" isOpen={openSection === 'manual'} onClick={() => toggleSection('manual')}>
             <div className="mb-4 bg-slate-900 p-2 rounded border border-slate-600">
                <div className="flex justify-between items-center mb-2">
                   <span className="text-xs font-bold text-orange-400">启动接管 (停止自动信号)</span>
                   <Toggle checked={activeConfig.manualTakeover} onChange={(v: boolean) => handleChange('manualTakeover', v)} />
                </div>
                <p className="text-[10px] text-slate-500">
                   开启后，策略自动信号将被屏蔽，仅响应下方手动按钮操作。
                </p>
             </div>
             <div className="grid grid-cols-2 gap-2 opacity-100 transition-opacity">
                <button onClick={() => onManualOrder('LONG')} className="bg-emerald-700 hover:bg-emerald-600 text-white p-2 rounded text-xs font-bold">
                  手动开多 (OPEN LONG)
                </button>
                <button onClick={() => onManualOrder('SHORT')} className="bg-rose-700 hover:bg-rose-600 text-white p-2 rounded text-xs font-bold">
                  手动开空 (OPEN SHORT)
                </button>
                <button onClick={() => onManualOrder('FLAT')} className="col-span-2 bg-slate-600 hover:bg-slate-500 text-white p-2 rounded text-xs font-bold">
                  一键平仓 (CLOSE ALL)
                </button>
             </div>
        </Accordion>

        {/* Section 4: Signal Config (Merged Indicators and Signals) */}
        <Accordion title="信号配置" isOpen={openSection === 'signals'} onClick={() => toggleSection('signals')}>
            <div className="space-y-4">
               {/* Trigger Mode */}
               <div className="bg-slate-900 p-2 rounded border border-slate-700 mb-2">
                   <div className="flex justify-between items-center">
                     <span className="text-xs font-bold text-slate-300">触发模式 (Trigger)</span>
                     <div className="flex items-center gap-2">
                        <span className={`text-[10px] ${!activeConfig.triggerOnClose ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>盘中实时</span>
                        <Toggle checked={activeConfig.triggerOnClose} onChange={(v: boolean) => handleChange('triggerOnClose', v)} size="sm" />
                        <span className={`text-[10px] ${activeConfig.triggerOnClose ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>K线收盘</span>
                     </div>
                   </div>
                   <p className="text-[9px] text-slate-500 mt-1">
                      K线收盘模式下，开仓和平仓信号仅在K线确认关闭时触发。止盈止损始终为盘中实时触发。
                   </p>
               </div>

               {/* Trend Filter */}
               <div className="bg-slate-900 p-2 rounded border border-slate-700">
                   <div className="text-xs font-bold text-slate-300 mb-2">趋势过滤 (Trend Filter)</div>
                   <Toggle label="多头趋势 (7>25>99) 不开空" checked={activeConfig.trendFilterBlockShort} onChange={(v: boolean) => handleChange('trendFilterBlockShort', v)} size="sm" className="mb-1"/>
                   <Toggle label="空头趋势 (7<25<99) 不开多" checked={activeConfig.trendFilterBlockLong} onChange={(v: boolean) => handleChange('trendFilterBlockLong', v)} size="sm"/>
               </div>

               {/* MACD Config */}
               <div className="bg-slate-900 p-2 rounded border border-slate-700">
                  <Toggle label="启用 MACD" checked={activeConfig.useMACD} onChange={(v: boolean) => handleChange('useMACD', v)} className="mb-2 font-bold text-slate-300"/>
                  {activeConfig.useMACD && (
                    <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                           <Input label="Fast" type="number" value={activeConfig.macdFast} onChange={(v: string) => handleChange('macdFast', parseFloat(v))} />
                           <Input label="Slow" type="number" value={activeConfig.macdSlow} onChange={(v: string) => handleChange('macdSlow', parseFloat(v))} />
                           <Input label="Sig" type="number" value={activeConfig.macdSignal} onChange={(v: string) => handleChange('macdSignal', parseFloat(v))} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <Toggle label="金叉开多" checked={activeConfig.macdLong} onChange={(v: boolean) => handleChange('macdLong', v)} size="sm" />
                            <Toggle label="死叉开空" checked={activeConfig.macdShort} onChange={(v: boolean) => handleChange('macdShort', v)} size="sm" />
                            <Toggle label="金叉平空" checked={activeConfig.macdExitShort} onChange={(v: boolean) => handleChange('macdExitShort', v)} size="sm" />
                            <Toggle label="死叉平多" checked={activeConfig.macdExitLong} onChange={(v: boolean) => handleChange('macdExitLong', v)} size="sm" />
                        </div>
                    </div>
                  )}
               </div>

               {/* EMA 7/25 */}
               <div className="bg-slate-900 p-2 rounded border border-slate-700">
                  <Toggle label="启用 EMA 7/25" checked={activeConfig.useEMA7_25} onChange={(v: boolean) => handleChange('useEMA7_25', v)} className="mb-2 font-bold text-blue-400"/>
                  {activeConfig.useEMA7_25 && (
                    <div className="grid grid-cols-2 gap-2">
                       <Toggle label="上穿开多" checked={activeConfig.ema7_25_Long} onChange={(v: boolean) => handleChange('ema7_25_Long', v)} size="sm" />
                       <Toggle label="下穿开空" checked={activeConfig.ema7_25_Short} onChange={(v: boolean) => handleChange('ema7_25_Short', v)} size="sm" />
                       <Toggle label="下穿平多" checked={activeConfig.ema7_25_ExitLong} onChange={(v: boolean) => handleChange('ema7_25_ExitLong', v)} size="sm" />
                       <Toggle label="上穿平空" checked={activeConfig.ema7_25_ExitShort} onChange={(v: boolean) => handleChange('ema7_25_ExitShort', v)} size="sm" />
                    </div>
                  )}
               </div>

               {/* EMA 7/99 */}
               <div className="bg-slate-900 p-2 rounded border border-slate-700">
                  <Toggle label="启用 EMA 7/99" checked={activeConfig.useEMA7_99} onChange={(v: boolean) => handleChange('useEMA7_99', v)} className="mb-2 font-bold text-purple-400"/>
                  {activeConfig.useEMA7_99 && (
                    <div className="grid grid-cols-2 gap-2">
                       <Toggle label="上穿开多" checked={activeConfig.ema7_99_Long} onChange={(v: boolean) => handleChange('ema7_99_Long', v)} size="sm" />
                       <Toggle label="下穿开空" checked={activeConfig.ema7_99_Short} onChange={(v: boolean) => handleChange('ema7_99_Short', v)} size="sm" />
                       <Toggle label="下穿平多" checked={activeConfig.ema7_99_ExitLong} onChange={(v: boolean) => handleChange('ema7_99_ExitLong', v)} size="sm" />
                       <Toggle label="上穿平空" checked={activeConfig.ema7_99_ExitShort} onChange={(v: boolean) => handleChange('ema7_99_ExitShort', v)} size="sm" />
                    </div>
                  )}
               </div>

               {/* EMA 25/99 */}
               <div className="bg-slate-900 p-2 rounded border border-slate-700">
                  <Toggle label="启用 EMA 25/99" checked={activeConfig.useEMA25_99} onChange={(v: boolean) => handleChange('useEMA25_99', v)} className="mb-2 font-bold text-indigo-400"/>
                  {activeConfig.useEMA25_99 && (
                    <div className="grid grid-cols-2 gap-2">
                       <Toggle label="上穿开多" checked={activeConfig.ema25_99_Long} onChange={(v: boolean) => handleChange('ema25_99_Long', v)} size="sm" />
                       <Toggle label="下穿开空" checked={activeConfig.ema25_99_Short} onChange={(v: boolean) => handleChange('ema25_99_Short', v)} size="sm" />
                       <Toggle label="下穿平多" checked={activeConfig.ema25_99_ExitLong} onChange={(v: boolean) => handleChange('ema25_99_ExitLong', v)} size="sm" />
                       <Toggle label="上穿平空" checked={activeConfig.ema25_99_ExitShort} onChange={(v: boolean) => handleChange('ema25_99_ExitShort', v)} size="sm" />
                    </div>
                  )}
               </div>

               {/* EMA Double (7/25 vs 99) */}
               <div className="bg-slate-900 p-2 rounded border border-slate-700">
                  <Toggle label="启用 EMA 7/25 上穿下穿 99" checked={activeConfig.useEMADouble} onChange={(v: boolean) => handleChange('useEMADouble', v)} className="mb-2 font-bold text-amber-400"/>
                  {activeConfig.useEMADouble && (
                    <div className="grid grid-cols-2 gap-2">
                       <Toggle label="7/25上穿99 开多" checked={activeConfig.emaDoubleLong} onChange={(v: boolean) => handleChange('emaDoubleLong', v)} size="sm" />
                       <Toggle label="7/25下穿99 开空" checked={activeConfig.emaDoubleShort} onChange={(v: boolean) => handleChange('emaDoubleShort', v)} size="sm" />
                       <Toggle label="7/25下穿99 平多" checked={activeConfig.emaDoubleExitLong} onChange={(v: boolean) => handleChange('emaDoubleExitLong', v)} size="sm" />
                       <Toggle label="7/25上穿99 平空" checked={activeConfig.emaDoubleExitShort} onChange={(v: boolean) => handleChange('emaDoubleExitShort', v)} size="sm" />
                    </div>
                  )}
               </div>
            </div>
        </Accordion>

        {/* Section 5: Exit Management */}
        <Accordion title="出场管理" isOpen={openSection === 'exits'} onClick={() => toggleSection('exits')}>
           <div className="space-y-4">
              
              {/* Trailing Stop */}
              <div className="bg-slate-900 p-2 rounded border border-slate-700">
                  <Toggle label="追踪止盈" checked={activeConfig.useTrailingStop} onChange={(v: boolean) => handleChange('useTrailingStop', v)} className="font-bold mb-2" />
                  {activeConfig.useTrailingStop && (
                     <div className="grid grid-cols-2 gap-2">
                        <Input label="激活比例 %" type="number" value={activeConfig.trailActivation} onChange={(v: string) => handleChange('trailActivation', parseFloat(v))} />
                        <Input label="回撤距离 %" type="number" value={activeConfig.trailDistance} onChange={(v: string) => handleChange('trailDistance', parseFloat(v))} />
                     </div>
                  )}
              </div>

              {/* Fixed TP/SL */}
              <div className="bg-slate-900 p-2 rounded border border-slate-700">
                  <Toggle label="固定止盈止损" checked={activeConfig.useFixedTPSL} onChange={(v: boolean) => handleChange('useFixedTPSL', v)} className="font-bold mb-2" />
                  {activeConfig.useFixedTPSL && (
                     <div className="grid grid-cols-2 gap-2">
                        <Input label="止盈 %" type="number" value={activeConfig.takeProfitPct} onChange={(v: string) => handleChange('takeProfitPct', parseFloat(v))} />
                        <Input label="止损 %" type="number" value={activeConfig.stopLossPct} onChange={(v: string) => handleChange('stopLossPct', parseFloat(v))} />
                     </div>
                  )}
              </div>

              {/* Multi-Level TP/SL */}
              <div className="bg-slate-900 p-2 rounded border border-slate-700">
                  <Toggle label="多级止盈止损" checked={activeConfig.useMultiTPSL} onChange={(v: boolean) => handleChange('useMultiTPSL', v)} className="font-bold mb-2" />
                  {activeConfig.useMultiTPSL && (
                    <div className="space-y-3">
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">分批止盈</div>
                        {activeConfig.tpLevels.map((tp, idx) => (
                           <div key={`tp-${idx}`} className="flex items-end gap-2 mb-2">
                               <div className="pb-2"><Toggle checked={tp.active} onChange={(v: boolean) => handleArrayChange('tpLevels', idx, 'active', v)} size="sm"/></div>
                               <div className="flex-1"><Input label={`止盈${idx+1} %`} value={tp.pct} onChange={(v: string) => handleArrayChange('tpLevels', idx, 'pct', parseFloat(v))} type="number" /></div>
                               <div className="flex-1"><Input label={`仓位 %`} value={tp.qtyPct} onChange={(v: string) => handleArrayChange('tpLevels', idx, 'qtyPct', parseFloat(v))} type="number" /></div>
                           </div>
                        ))}
                      </div>
                      <div className="border-t border-slate-700 pt-2">
                        <div className="text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">分批止损</div>
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
              <div className="bg-slate-900 p-2 rounded border border-slate-700">
                  <Toggle label="反手策略 (Stop & Reverse)" checked={activeConfig.useReverse} onChange={(v: boolean) => handleChange('useReverse', v)} className="font-bold mb-2" />
                  {activeConfig.useReverse && (
                     <div className="space-y-1">
                        <Toggle label="多转空" checked={activeConfig.reverseLongToShort} onChange={(v: boolean) => handleChange('reverseLongToShort', v)} size="sm"/>
                        <Toggle label="空转多" checked={activeConfig.reverseShortToLong} onChange={(v: boolean) => handleChange('reverseShortToLong', v)} size="sm"/>
                     </div>
                  )}
              </div>

           </div>
        </Accordion>
        
        {/* Section 6: Risk */}
        <Accordion title="风控 & 限制" isOpen={openSection === 'risk'} onClick={() => toggleSection('risk')}>
             <Input label="每日最大交易次数" type="number" value={activeConfig.maxDailyTrades} onChange={(v: string) => handleChange('maxDailyTrades', parseFloat(v))} />
        </Accordion>

      </div>
    </div>
  );
};

// --- Reusable UI Components ---

const Accordion = ({ title, isOpen, onClick, children }: any) => (
  <div className="border-b border-slate-700">
    <button 
      className="w-full flex justify-between items-center p-4 bg-slate-800 hover:bg-slate-700 transition-colors"
      onClick={onClick}
    >
      <span className="font-semibold text-slate-200 text-sm">{title}</span>
      <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
    </button>
    {isOpen && <div className="p-4 bg-slate-800/50">{children}</div>}
  </div>
);

const Input = ({ label, value, onChange, type = "text", placeholder }: any) => (
  <div className="mb-2">
    <label className="block text-slate-400 text-xs mb-1">{label}</label>
    <input 
      type={type} 
      value={value} 
      onChange={(e) => onChange(e.target.value)} 
      placeholder={placeholder}
      className="w-full bg-slate-900 border border-slate-600 rounded p-1.5 text-xs text-white focus:border-blue-500 outline-none"
    />
  </div>
);

const Select = ({ label, value, options, onChange }: any) => (
  <div className="mb-2">
    <label className="block text-slate-400 text-xs mb-1">{label}</label>
    <select 
      value={value} 
      onChange={(e) => onChange(e.target.value)} 
      className="w-full bg-slate-900 border border-slate-600 rounded p-1.5 text-xs text-white focus:border-blue-500 outline-none"
    >
      {options.map((o: any) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const Toggle = ({ label, checked, onChange, size = "md", className = "" }: any) => (
  <div className={`flex items-center justify-between ${className}`}>
    <span className={`text-slate-300 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>{label}</span>
    <button 
      onClick={() => onChange(!checked)}
      className={`relative inline-flex items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-700'} ${size === 'sm' ? 'h-4 w-8' : 'h-6 w-11'}`}
    >
      <span className={`inline-block transform rounded-full bg-white transition-transform ${size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} ${checked ? (size === 'sm' ? 'translate-x-4' : 'translate-x-6') : 'translate-x-1'}`} />
    </button>
  </div>
);

export default ControlPanel;

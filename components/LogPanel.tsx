
import React, { useState, useMemo } from 'react';
import { AlertLog } from '../types';

interface LogPanelProps {
  logs: AlertLog[];
  strategies: { id: string; name: string; symbol: string }[];
}

const LogPanel: React.FC<LogPanelProps> = ({ logs, strategies }) => {
  const [filterId, setFilterId] = useState<string>('all');

  const getActionText = (action: string, position: string) => {
     if (action === 'buy' && position === 'long') return '开多 (Open Long)';
     if (action === 'sell' && position === 'short') return '开空 (Open Short)';
     if (action === 'sell' && position === 'flat') return '平多 (Close Long)';
     if (action === 'buy' && position === 'flat') return '平空 (Close Short)';
     if (action === 'buy_to_cover') return '平空 (Close Short)'; // Legacy support
     if (action === 'sell') return '卖出 (Sell)'; // Fallback
     return `${action} ${position}`;
  }

  const filteredLogs = useMemo(() => {
    if (filterId === 'all') return logs;
    return logs.filter(log => log.strategyId === filterId);
  }, [logs, filterId]);

  return (
    <div className="bg-white rounded-lg border border-slate-200 h-full flex flex-col overflow-hidden shadow-sm">
      <div className="p-3 border-b border-slate-200 bg-slate-50 rounded-t-lg flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-4">
            <h3 className="font-semibold text-slate-800">信号日志</h3>
            <select 
               value={filterId} 
               onChange={(e) => setFilterId(e.target.value)}
               className="text-xs bg-white border border-slate-300 rounded p-1 outline-none text-slate-700"
            >
                <option value="all">显示全部</option>
                {strategies.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.symbol})</option>
                ))}
            </select>
        </div>
        <span className="text-xs text-slate-500">{filteredLogs.length} 条</span>
      </div>
      <div className="flex-1 overflow-y-auto p-0 font-mono text-xs custom-scrollbar bg-white">
        {filteredLogs.length === 0 ? (
          <div className="p-4 text-slate-400 text-center">暂无触发记录。</div>
        ) : (
          <table className="w-full text-left table-fixed">
            <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="p-3 w-24">时间</th>
                <th className="p-3 w-32">策略 / 交易对</th>
                <th className="p-3 w-20">类型</th>
                <th className="p-3 w-32">动作</th>
                <th className="p-3 w-40">触发条件</th>
                <th className="p-3 w-20">执行价格</th>
                <th className="p-3 w-20">执行数量</th>
                <th className="p-3 w-24">成交额(U)</th>
                <th className="p-3 w-20">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Removed .reverse() because App.tsx already puts newest at index 0 */}
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors text-slate-700">
                  <td className="p-3 text-slate-500 truncate">{new Date(log.timestamp).toLocaleTimeString()}</td>
                  <td className="p-3 text-slate-800 truncate">
                    <div className="font-bold truncate" title={log.strategyName}>{log.strategyName}</div>
                    <div className="text-[10px] text-slate-400">{log.payload.symbol}</div>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                      log.type.includes('Manual') ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                    }`}>
                      {log.type}
                    </span>
                  </td>
                  <td className="p-3 text-slate-800 font-bold truncate">
                    {getActionText(log.payload.action, log.payload.position)}
                  </td>
                  <td className="p-3 text-amber-600 font-medium truncate" title={log.payload.tp_level}>
                    {log.payload.tp_level}
                  </td>
                  <td className="p-3 text-blue-600 font-medium">
                     {log.payload.execution_price ? log.payload.execution_price.toFixed(4) : '-'}
                  </td>
                  <td className="p-3 text-purple-600 font-medium">
                     {log.payload.execution_quantity ? log.payload.execution_quantity.toFixed(4) : '-'}
                  </td>
                  <td className="p-3 text-slate-600 font-medium">${log.payload.trade_amount.toFixed(2)}</td>
                  <td className="p-3">
                    <span className="text-emerald-600 flex items-center gap-1 font-medium">
                      ✔ 已发送
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default LogPanel;

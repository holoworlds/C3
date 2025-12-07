
import React from 'react';
import { AlertLog } from '../types';

interface LogPanelProps {
  logs: AlertLog[];
}

const LogPanel: React.FC<LogPanelProps> = ({ logs }) => {
  
  const getActionText = (action: string, position: string) => {
     if (action === 'buy' && position === 'long') return '开多 (Open Long)';
     if (action === 'sell' && position === 'short') return '开空 (Open Short)';
     if (action === 'sell' && position === 'flat') return '平多 (Close Long)';
     if (action === 'buy_to_cover' && position === 'flat') return '平空 (Close Short)';
     if (action === 'buy_to_cover') return '平空 (Close Short)'; // Fallback
     if (action === 'sell') return '卖出 (Sell)'; // Fallback
     return `${action} ${position}`;
  }

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 h-full flex flex-col overflow-hidden">
      <div className="p-3 border-b border-slate-700 bg-slate-800/50 rounded-t-lg flex justify-between items-center flex-shrink-0">
        <h3 className="font-semibold text-slate-200">信号日志 (所有策略)</h3>
        <span className="text-xs text-slate-500">{logs.length} 条</span>
      </div>
      <div className="flex-1 overflow-y-auto p-0 font-mono text-xs custom-scrollbar">
        {logs.length === 0 ? (
          <div className="p-4 text-slate-500 text-center">暂无触发记录。</div>
        ) : (
          <table className="w-full text-left table-fixed">
            <thead className="bg-slate-900 text-slate-400 sticky top-0 z-10">
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
            <tbody className="divide-y divide-slate-700">
              {logs.slice().reverse().map((log) => (
                <tr key={log.id} className="hover:bg-slate-700/50 transition-colors">
                  <td className="p-3 text-slate-400 truncate">{new Date(log.timestamp).toLocaleTimeString()}</td>
                  <td className="p-3 text-white truncate">
                    <div className="font-bold truncate" title={log.strategyName}>{log.strategyName}</div>
                    <div className="text-[10px] text-slate-500">{log.payload.symbol}</div>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                      log.type.includes('Strategy') ? 'bg-blue-900 text-blue-400' : 'bg-purple-900 text-purple-400'
                    }`}>
                      {log.type}
                    </span>
                  </td>
                  <td className="p-3 text-slate-300 font-bold truncate">
                    {getActionText(log.payload.action, log.payload.position)}
                  </td>
                  <td className="p-3 text-amber-300 font-medium truncate" title={log.payload.tp_level}>
                    {log.payload.tp_level}
                  </td>
                  <td className="p-3 text-blue-300">
                     {log.payload.execution_price ? log.payload.execution_price.toFixed(4) : '-'}
                  </td>
                  <td className="p-3 text-purple-300">
                     {log.payload.execution_quantity ? log.payload.execution_quantity.toFixed(4) : '-'}
                  </td>
                  <td className="p-3 text-slate-300">${log.payload.trade_amount.toFixed(2)}</td>
                  <td className="p-3">
                    <span className="text-emerald-500 flex items-center gap-1">
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

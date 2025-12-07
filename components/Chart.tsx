
import React, { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  Cell,
  ReferenceDot
} from 'recharts';
import { Candle, AlertLog } from '../types';

interface ChartProps {
  data: Candle[];
  logs: AlertLog[];
  symbol: string;
  interval: string;
}

const formatXAxis = (tickItem: number) => {
  const date = new Date(tickItem);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const candle = payload[0].payload;
    return (
      <div className="bg-slate-800 border border-slate-700 p-3 rounded shadow-lg text-xs z-50">
        <p className="font-bold text-slate-200 mb-2">{new Date(label).toLocaleString()}</p>
        <p className="text-emerald-400">开盘: {candle.open}</p>
        <p className="text-emerald-400">最高: {candle.high}</p>
        <p className="text-rose-400">最低: {candle.low}</p>
        <p className={`font-semibold ${candle.close >= candle.open ? 'text-emerald-400' : 'text-rose-400'}`}>
          收盘: {candle.close}
        </p>
        <div className="mt-2 pt-2 border-t border-slate-700">
          <p className="text-yellow-400">EMA 7: {candle.ema7?.toFixed(2)}</p>
          <p className="text-blue-400">EMA 25: {candle.ema25?.toFixed(2)}</p>
          <p className="text-purple-400">EMA 99: {candle.ema99?.toFixed(2)}</p>
        </div>
      </div>
    );
  }
  return null;
};

const Chart: React.FC<ChartProps> = ({ data, logs, symbol, interval }) => {
  // Pre-process data for the Bar (Candle Body) representation
  const processedData = useMemo(() => {
     return data.map(d => ({
        ...d,
        body: [Math.min(d.open, d.close), Math.max(d.open, d.close)],
        color: d.close >= d.open ? '#10b981' : '#f43f5e'
     }));
  }, [data]);

  // Generate markers from logs
  const markers = useMemo(() => {
    return logs.map(log => {
        const logTime = log.timestamp;
        
        // Find candle where logTime falls within [candle.time, nextCandle.time)
        // Since data is sorted, we can find the index
        let closestCandle = null;
        
        // Find the last candle that started before or at logTime
        for(let i = data.length - 1; i >= 0; i--) {
            if (data[i].time <= logTime) {
                closestCandle = data[i];
                break;
            }
        }
        
        if (!closestCandle) return null;

        const isBuy = log.payload.action === 'buy' || log.payload.action === 'buy_to_cover';
        
        // Determine Y position: Buy below Low, Sell above High
        const yPos = isBuy ? closestCandle.low : closestCandle.high;
        
        return {
            id: log.id,
            x: closestCandle.time,
            y: yPos,
            type: isBuy ? 'buy' : 'sell',
            label: isBuy ? '▲' : '▼',
            color: isBuy ? '#10b981' : '#f43f5e'
        };
    }).filter(Boolean) as any[];
  }, [logs, data]);

  if (data.length === 0) return <div className="h-full flex items-center justify-center text-slate-500">数据加载中... (Waiting for {symbol} {interval})</div>;

  const minPrice = Math.min(...data.map(d => d.low));
  const maxPrice = Math.max(...data.map(d => d.high));
  const padding = (maxPrice - minPrice) * 0.1;

  // Use a key based on symbol/interval to force re-mounting when context changes. 
  // This solves the Y-Axis animation/scaling issue when switching assets (e.g. BTC -> ETH).
  const chartKey = `${symbol}-${interval}-${data.length}`;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart key={chartKey} data={processedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
        <XAxis 
          dataKey="time" 
          tickFormatter={formatXAxis} 
          stroke="#94a3b8" 
          tick={{ fontSize: 12 }}
          minTickGap={30}
          type="number"
          domain={['dataMin', 'dataMax']}
        />
        <YAxis 
          domain={[minPrice - padding, maxPrice + padding]} 
          orientation="right" 
          stroke="#94a3b8" 
          tick={{ fontSize: 12 }} 
          tickFormatter={(val) => val.toFixed(2)}
          allowDataOverflow={false}
        />
        <Tooltip content={<CustomTooltip />} />
        
        {/* EMAs */}
        <Line type="monotone" dataKey="ema7" stroke="#facc15" dot={false} strokeWidth={2} isAnimationActive={false} />
        <Line type="monotone" dataKey="ema25" stroke="#60a5fa" dot={false} strokeWidth={2} isAnimationActive={false} />
        <Line type="monotone" dataKey="ema99" stroke="#c084fc" dot={false} strokeWidth={2} isAnimationActive={false} />

        {/* Candle Bodies - using Bar with range */}
        <Bar dataKey="body" isAnimationActive={false}>
            {processedData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} stroke={entry.color} />
            ))}
        </Bar>

        {/* Trade Markers */}
        {markers.map((m) => (
            <ReferenceDot
                key={m.id}
                x={m.x}
                y={m.y}
                r={6}
                fill={m.color}
                stroke="#fff"
                strokeWidth={1}
                label={{ 
                    value: m.label, 
                    position: m.type === 'buy' ? 'bottom' : 'top', 
                    fill: m.color, 
                    fontSize: 16, 
                    fontWeight: 'bold' 
                }}
            />
        ))}

      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default Chart;

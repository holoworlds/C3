
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
  ReferenceDot,
  Brush
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
      <div className="bg-white border border-slate-200 p-3 rounded shadow-lg text-xs z-50 text-slate-800">
        <p className="font-bold text-slate-900 mb-2">{new Date(label).toLocaleString()}</p>
        <p className="text-emerald-600">开盘: {candle.open}</p>
        <p className="text-emerald-600">最高: {candle.high}</p>
        <p className="text-rose-500">最低: {candle.low}</p>
        <p className={`font-semibold ${candle.close >= candle.open ? 'text-emerald-600' : 'text-rose-500'}`}>
          收盘: {candle.close}
        </p>
        <div className="mt-2 pt-2 border-t border-slate-100">
          <p className="text-amber-500">EMA 7: {candle.ema7?.toFixed(2)}</p>
          <p className="text-blue-500">EMA 25: {candle.ema25?.toFixed(2)}</p>
          <p className="text-purple-500">EMA 99: {candle.ema99?.toFixed(2)}</p>
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
        color: d.close >= d.open ? '#10b981' : '#f43f5e' // Emerald-500, Rose-500
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

  // Default Zoom: Show last 91 candles
  const startIndex = Math.max(0, data.length - 91);

  if (data.length === 0) return <div className="h-full flex items-center justify-center text-slate-400">数据加载中... (Waiting for {symbol} {interval})</div>;

  const minPrice = Math.min(...data.map(d => d.low));
  const maxPrice = Math.max(...data.map(d => d.high));
  const padding = (maxPrice - minPrice) * 0.1;

  // Use a key based on symbol/interval to force re-mounting when context changes. 
  // REMOVED data.length to prevent flickering on every tick
  const chartKey = `${symbol}-${interval}`;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart key={chartKey} data={processedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis 
          dataKey="time" 
          tickFormatter={formatXAxis} 
          stroke="#64748b" 
          tick={{ fontSize: 12 }}
          minTickGap={30}
          type="number"
          domain={['dataMin', 'dataMax']}
        />
        <YAxis 
          domain={[minPrice - padding, maxPrice + padding]} 
          orientation="right" 
          stroke="#64748b" 
          tick={{ fontSize: 12 }} 
          tickFormatter={(val) => val.toFixed(2)}
          allowDataOverflow={false}
        />
        <Tooltip content={<CustomTooltip />} />
        
        {/* EMAs */}
        <Line type="monotone" dataKey="ema7" stroke="#eab308" dot={false} strokeWidth={2} isAnimationActive={false} />
        <Line type="monotone" dataKey="ema25" stroke="#3b82f6" dot={false} strokeWidth={2} isAnimationActive={false} />
        <Line type="monotone" dataKey="ema99" stroke="#a855f7" dot={false} strokeWidth={2} isAnimationActive={false} />

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

        {/* Brush for Zooming */}
        <Brush 
           key={startIndex} // Update key to force refresh when data shifts (e.g. new candle) to keep view aligned
           dataKey="time" 
           height={30} 
           stroke="#cbd5e1" 
           tickFormatter={formatXAxis}
           startIndex={startIndex}
        />

      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default Chart;

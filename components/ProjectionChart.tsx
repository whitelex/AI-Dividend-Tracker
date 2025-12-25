
import React from 'react';
import { 
  ComposedChart, 
  Area, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';
import { ProjectionPoint } from '../types';

interface ProjectionChartProps {
  data: ProjectionPoint[];
}

const ProjectionChart: React.FC<ProjectionChartProps> = ({ data }) => {
  const formatYAxisCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  const formatYAxisPercent = (value: number) => `${value.toFixed(0)}%`;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const p = payload[0]?.payload as ProjectionPoint;
      if (!p) return null;
      
      return (
        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700 p-4 rounded-xl shadow-2xl text-sm min-w-[260px] z-50">
          <div className="flex justify-between items-center border-b border-slate-700 pb-2 mb-3">
            <p className="font-bold text-indigo-300">Year {label} Projection</p>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded uppercase tracking-tighter">
              {p.shares?.toLocaleString() || 0} Shares
            </span>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-xs">Portfolio Value (Base):</span>
              <span className="font-mono text-white font-bold">${p.balance?.toLocaleString() || 0}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="bg-rose-500/10 p-1.5 rounded border border-rose-500/20 text-center">
                <p className="text-[9px] uppercase text-rose-400 font-bold mb-0.5">Bear Case</p>
                <p className="text-xs font-mono text-rose-200">${p.bearBalance?.toLocaleString() || 0}</p>
              </div>
              <div className="bg-emerald-500/10 p-1.5 rounded border border-emerald-500/20 text-center">
                <p className="text-[9px] uppercase text-emerald-400 font-bold mb-0.5">Bull Case</p>
                <p className="text-xs font-mono text-emerald-200">${p.bullBalance?.toLocaleString() || 0}</p>
              </div>
            </div>

            <div className="pt-2 mt-2 border-t border-slate-800 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-emerald-400 text-xs">Annual Income:</span>
                <span className="font-mono text-white">${p.annualIncome?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-amber-400 text-xs font-bold">Yield on Cost:</span>
                <span className="font-mono text-amber-300 font-bold">{p.yoc?.toFixed(2) || '0.00'}%</span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-2xl relative overflow-hidden w-full">
      {/* Decorative gradient blur */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 blur-[80px] rounded-full pointer-events-none"></div>
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <i className="fas fa-project-diagram text-indigo-400 text-base"></i>
            Compound Growth Engine
          </h3>
          <p className="text-xs text-slate-500 font-medium">Modeling share accumulation & price volatility range</p>
        </div>
        <div className="flex gap-2">
          <div className="text-[9px] bg-slate-900 border border-slate-700 text-slate-400 px-2 py-1 rounded-md flex items-center gap-1.5 font-bold uppercase tracking-wider">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Bull
          </div>
          <div className="text-[9px] bg-slate-900 border border-slate-700 text-slate-400 px-2 py-1 rounded-md flex items-center gap-1.5 font-bold uppercase tracking-wider">
            <div className="w-2 h-2 rounded-full bg-indigo-500"></div> Base
          </div>
          <div className="text-[9px] bg-slate-900 border border-slate-700 text-slate-400 px-2 py-1 rounded-md flex items-center gap-1.5 font-bold uppercase tracking-wider">
            <div className="w-2 h-2 rounded-full bg-rose-500"></div> Bear
          </div>
        </div>
      </div>

      <div className="h-[400px] w-full min-h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
            <defs>
              <linearGradient id="colorScenarios" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.5} />
            <XAxis 
              dataKey="year" 
              stroke="#64748b" 
              fontSize={11} 
              tickLine={false} 
              axisLine={false} 
              dy={10}
            />
            
            <YAxis 
              yAxisId="left"
              stroke="#64748b" 
              fontSize={11} 
              tickFormatter={formatYAxisCurrency} 
              tickLine={false} 
              axisLine={false} 
            />
            
            <YAxis 
              yAxisId="right"
              orientation="right"
              stroke="#fbbf24" 
              fontSize={11} 
              tickFormatter={formatYAxisPercent} 
              tickLine={false} 
              axisLine={false} 
            />

            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#475569', strokeWidth: 1 }} />
            <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em' }} />
            
            <Area
              yAxisId="left"
              name="Volatility Range (Bear-Bull)"
              dataKey="bullBalance"
              stroke="none"
              fill="#6366f1"
              fillOpacity={0.05}
              activeDot={false}
            />
            <Area
              yAxisId="left"
              dataKey="bearBalance"
              stroke="none"
              fill="#0f172a"
              fillOpacity={1}
              activeDot={false}
            />

            <Line
              yAxisId="left"
              name="Portfolio Value (Base)"
              type="monotone"
              dataKey="balance"
              stroke="#6366f1"
              strokeWidth={4}
              dot={false}
              activeDot={{ r: 6, fill: '#6366f1', stroke: '#1e293b', strokeWidth: 2 }}
            />

            <Line
              yAxisId="left"
              name="Annual Income"
              type="monotone"
              dataKey="annualIncome"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />

            <Line
              yAxisId="right"
              name="Yield on Cost"
              type="monotone"
              dataKey="yoc"
              stroke="#fbbf24"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ProjectionChart;

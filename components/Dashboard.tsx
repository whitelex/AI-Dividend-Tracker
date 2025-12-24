
import React from 'react';
import { PortfolioSummary } from '../types';

interface DashboardProps {
  summary: PortfolioSummary;
}

const Dashboard: React.FC<DashboardProps> = ({ summary }) => {
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  
  const formatPercent = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2 }).format(val / 100);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm">
        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">Total Value</p>
        <p className="text-2xl font-bold text-white">{formatCurrency(summary.totalValue)}</p>
        <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1">
          <i className="fas fa-chart-line"></i> Market Estimate
        </div>
      </div>
      
      <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm">
        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">Annual Income</p>
        <p className="text-2xl font-bold text-emerald-400">{formatCurrency(summary.annualIncome)}</p>
        <div className="mt-2 text-xs text-slate-400 flex items-center gap-1">
          <i className="fas fa-calendar-alt"></i> Distributed monthly/quarterly
        </div>
      </div>

      <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm">
        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">Avg. Yield</p>
        <p className="text-2xl font-bold text-indigo-300">{formatPercent(summary.averageYield)}</p>
        <div className="mt-2 text-xs text-slate-400 flex items-center gap-1">
          <i className="fas fa-percentage"></i> Weighted average
        </div>
      </div>

      <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm">
        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">Yield on Cost</p>
        <p className="text-2xl font-bold text-amber-300">{formatPercent(summary.yieldOnCost)}</p>
        <div className="mt-2 text-xs text-slate-400 flex items-center gap-1">
          <i className="fas fa-piggy-bank"></i> Based on purchase price
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

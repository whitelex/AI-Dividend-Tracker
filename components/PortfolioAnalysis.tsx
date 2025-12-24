
import React from 'react';

interface PortfolioAnalysisProps {
  onAnalyze: () => void;
  analysis: string | null;
  isLoading: boolean;
  hasData: boolean;
}

const PortfolioAnalysis: React.FC<PortfolioAnalysisProps> = ({ onAnalyze, analysis, isLoading, hasData }) => {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <i className="fas fa-brain text-indigo-400"></i>
          <h3 className="font-bold text-white">Gemini AI Strategist</h3>
        </div>
        {!isLoading && hasData && (
          <button 
            onClick={onAnalyze}
            className="text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1 px-3 rounded-full transition uppercase tracking-wider shadow-lg shadow-indigo-500/20"
          >
            {analysis ? 'Re-Analyze' : 'Run Analysis'}
          </button>
        )}
      </div>
      
      <div className="flex-grow p-6 overflow-y-auto max-h-[600px] custom-scrollbar">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center py-12 text-slate-500">
            <div className="relative mb-6">
              <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
              <i className="fas fa-robot absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xl text-indigo-400 animate-pulse"></i>
            </div>
            <p className="text-sm font-medium animate-pulse">Gemini is analyzing your holdings...</p>
            <p className="text-[10px] mt-2 uppercase tracking-widest opacity-50 font-bold">Checking Yield Quality & Growth Vectors</p>
          </div>
        ) : !hasData ? (
          <div className="h-full flex flex-col items-center justify-center py-12 text-slate-500 text-center">
            <i className="fas fa-folder-open text-4xl mb-4 opacity-20"></i>
            <p className="text-sm">Add stocks to your portfolio to enable AI strategic analysis.</p>
          </div>
        ) : !analysis ? (
          <div className="h-full flex flex-col items-center justify-center py-12 text-center">
            <div className="bg-indigo-900/20 p-6 rounded-full mb-6">
              <i className="fas fa-wand-magic-sparkles text-4xl text-indigo-400"></i>
            </div>
            <h4 className="text-slate-200 font-bold mb-2">Portfolio Insights Ready</h4>
            <p className="text-slate-400 text-xs max-w-[200px] mx-auto leading-relaxed">
              Let our AI analyze your diversification, risk profile, and future income growth.
            </p>
            <button 
              onClick={onAnalyze}
              className="mt-6 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-6 rounded-lg transition text-sm"
            >
              Analyze My Portfolio
            </button>
          </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            {analysis.split('\n').map((line, i) => {
              if (line.startsWith('#')) {
                return <h4 key={i} className="text-indigo-400 font-bold mt-4 mb-2 uppercase tracking-wide text-xs">{line.replace(/#/g, '').trim()}</h4>;
              }
              if (line.startsWith('*') || line.startsWith('-')) {
                return <li key={i} className="text-slate-300 ml-4 mb-1 list-none flex gap-2">
                  <span className="text-indigo-500 mt-1">•</span>
                  <span>{line.substring(1).trim()}</span>
                </li>;
              }
              if (line.trim() === '') return <div key={i} className="h-2"></div>;
              return <p key={i} className="text-slate-400 leading-relaxed mb-3">{line}</p>;
            })}
            <div className="mt-8 pt-4 border-t border-slate-700/50 flex items-center gap-2">
              <i className="fas fa-shield-halved text-emerald-500/50 text-[10px]"></i>
              <span className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">AI generated advisory • For informational purposes only</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioAnalysis;

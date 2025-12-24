
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StockHolding, DividendData, PortfolioSummary, ProjectionPoint } from './types';
import { fetchStockDividendData, analyzePortfolio } from './services/geminiService';
import StockForm from './components/StockForm';
import Dashboard from './components/Dashboard';
import ProjectionChart from './components/ProjectionChart';
import PortfolioAnalysis from './components/PortfolioAnalysis';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [stockInfo, setStockInfo] = useState<Record<string, DividendData>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true); // Default to true to allow UI access
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Initial connection check (silent)
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else {
        setHasApiKey(!!process.env.API_KEY);
      }
    };
    checkKey();
  }, []);

  // Close settings when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOpenKeyPicker = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      try {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
        setError(null);
        setIsSettingsOpen(false);
      } catch (err) {
        console.error("Key picker failed:", err);
      }
    } else {
      setError("To use DiviTrack Pro outside of AI Studio, please set your API_KEY environment variable.");
    }
  };

  // State persistence
  useEffect(() => {
    const savedHoldings = localStorage.getItem('divi_holdings');
    const savedInfo = localStorage.getItem('divi_stock_info');
    if (savedHoldings) setHoldings(JSON.parse(savedHoldings));
    if (savedInfo) setStockInfo(JSON.parse(savedInfo));
  }, []);

  useEffect(() => {
    localStorage.setItem('divi_holdings', JSON.stringify(holdings));
    localStorage.setItem('divi_stock_info', JSON.stringify(stockInfo));
  }, [holdings, stockInfo]);

  const addHolding = async (ticker: string, quantity: number, date: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!stockInfo[ticker]) {
        const data = await fetchStockDividendData(ticker);
        if (data) {
          setStockInfo(prev => ({ ...prev, [ticker]: data }));
          setAnalysisResult(null);
        }
      }
      const newHolding: StockHolding = {
        id: Math.random().toString(36).substr(2, 9),
        ticker: ticker.toUpperCase(),
        quantity,
        purchaseDate: date,
      };
      setHoldings(prev => [...prev, newHolding]);
    } catch (err: any) {
      if (err.message === "MISSING_API_KEY" || err.message?.includes("API key")) {
        setHasApiKey(false);
        setError("API Key Required: Please use the Settings menu to connect your Gemini API key.");
      } else {
        setError(`Connection Error: Could not retrieve data for ${ticker}.`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const runAnalysis = async () => {
    if (holdings.length === 0) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await analyzePortfolio(holdings, stockInfo);
      setAnalysisResult(result);
    } catch (err: any) {
      if (err.message === "MISSING_API_KEY") {
        setHasApiKey(false);
        setError("AI Engine offline. Please check your API connection.");
      } else {
        setError("Strategic analysis encountered an error. Please try again.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const portfolioSummary = useMemo<PortfolioSummary>(() => {
    let totalValue = 0, annualIncome = 0, totalShares = 0;
    holdings.forEach(h => {
      const data = stockInfo[h.ticker];
      totalShares += h.quantity;
      if (data) {
        totalValue += h.quantity * data.currentPrice;
        annualIncome += h.quantity * data.annualDividend;
      }
    });
    const weightedYield = totalValue > 0 ? (annualIncome / totalValue) * 100 : 0;
    return { totalValue, annualIncome, averageYield: weightedYield, yieldOnCost: weightedYield, totalShares };
  }, [holdings, stockInfo]);

  const projectionData = useMemo<ProjectionPoint[]>(() => {
    const points: ProjectionPoint[] = [];
    const initialInvestment = portfolioSummary.totalValue || 1;
    const stocks = Object.values(stockInfo);
    const avgGrowth = stocks.length > 0 ? stocks.reduce((acc, curr) => acc + (curr.growthRate || 0), 0) / stocks.length / 100 : 0.07;
    const initialAvgPrice = portfolioSummary.totalValue / (portfolioSummary.totalShares || 1);
    const initialDivPerShare = portfolioSummary.annualIncome / (portfolioSummary.totalShares || 1);

    let shares = portfolioSummary.totalShares, divPerShare = initialDivPerShare;
    let priceBase = initialAvgPrice, priceBear = initialAvgPrice, priceBull = initialAvgPrice;
    let cumulativeDiv = 0;

    for (let year = 0; year <= 20; year++) {
      const income = shares * divPerShare;
      points.push({
        year, balance: Math.round(shares * priceBase), bearBalance: Math.round(shares * priceBear),
        bullBalance: Math.round(shares * priceBull), annualIncome: Math.round(income),
        cumulativeDividends: Math.round(cumulativeDiv), yoc: (income / initialInvestment) * 100,
        shares: Number(shares.toFixed(2))
      });
      cumulativeDiv += income;
      shares += priceBase > 0 ? income / priceBase : 0;
      divPerShare *= (1 + avgGrowth);
      priceBase *= 1.05; priceBear *= 1.01; priceBull *= 1.09;
    }
    return points;
  }, [portfolioSummary, stockInfo]);

  return (
    <div className="min-h-screen pb-12 bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
      <nav className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 p-4 sticky top-0 z-[100]">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-600/20">
              <i className="fas fa-chart-line text-white text-lg"></i>
            </div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                DiviTrack <span className="text-indigo-500">Pro</span>
              </h1>
              <div className="flex items-center gap-1.5 -mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${hasApiKey ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-rose-500 shadow-[0_0_5px_#ef4444]'} animate-pulse`}></div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  {hasApiKey ? 'Engine Active' : 'Key Needed'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="relative" ref={settingsRef}>
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`flex items-center gap-3 text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all border ${isSettingsOpen ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-indigo-500/50'}`}
            >
              <i className={`fas fa-cog ${isSettingsOpen ? 'rotate-90' : ''} transition-transform`}></i>
              Config
            </button>

            {isSettingsOpen && (
              <div className="absolute right-0 mt-3 w-72 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 animate-in fade-in slide-in-from-top-2 z-[110]">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-800 pb-2">Environment Setup</h3>
                <div className="space-y-3">
                  <button 
                    onClick={handleOpenKeyPicker}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl transition text-left group shadow-lg shadow-indigo-600/10"
                  >
                    <div className="flex items-center gap-3">
                      <i className="fas fa-plug text-white text-xs"></i>
                      <span className="text-xs font-bold text-white">Connect System Key</span>
                    </div>
                    <i className="fas fa-chevron-right text-[10px] text-white/50 group-hover:translate-x-1 transition-transform"></i>
                  </button>
                  
                  <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <p className="text-[9px] text-slate-500 leading-relaxed">
                      If running on Vercel, ensure <code className="text-indigo-400">API_KEY</code> is set in project variables.
                    </p>
                  </div>

                  <button 
                    onClick={() => { localStorage.clear(); window.location.reload(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800/30 hover:bg-rose-900/20 hover:text-rose-400 rounded-xl transition text-left"
                  >
                    <i className="fas fa-sync-alt text-xs"></i>
                    <span className="text-xs font-bold">Hard Reset App</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/50 p-4 rounded-2xl mb-8 flex items-center justify-between text-rose-300 animate-in slide-in-from-top-4 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center">
                <i className="fas fa-shield-virus text-lg"></i>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-tight">System Notification</p>
                <p className="text-xs font-medium opacity-90">{error}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleOpenKeyPicker} className="text-[10px] font-black uppercase bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition shadow-lg shadow-indigo-600/20">
                Connect Now
              </button>
              <button onClick={() => setError(null)} className="text-slate-500 hover:text-white p-2">
                <i className="fas fa-times"></i>
              </button>
            </div>
          </div>
        )}

        <Dashboard summary={portfolioSummary} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <StockForm onAdd={addHolding} isLoading={isLoading} />
            <PortfolioAnalysis onAnalyze={runAnalysis} analysis={analysisResult} isLoading={isAnalyzing} hasData={holdings.length > 0} />
            
            <div className="bg-slate-800 p-6 rounded-[2rem] border border-slate-700 shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 blur-[50px] rounded-full"></div>
              <div className="flex justify-between items-center mb-6 relative">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Positions List</h3>
                <span className="text-[9px] font-black bg-slate-900 text-slate-500 px-2 py-1 rounded-md border border-slate-700">
                  {holdings.length} ASSETS
                </span>
              </div>
              <div className="space-y-3 max-h-[440px] overflow-y-auto custom-scrollbar pr-1">
                {holdings.map(h => (
                  <div key={h.id} className="bg-slate-900/40 p-4 rounded-2xl border border-slate-700/30 flex items-center justify-between group hover:border-indigo-500/50 transition-all hover:bg-slate-900/60">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600/10 flex items-center justify-center font-black text-indigo-400 text-xs border border-indigo-500/20 group-hover:scale-110 transition-transform">
                        {h.ticker.substring(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-black text-slate-100 text-sm tracking-tighter">{h.ticker}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2 font-bold">
                          <span>{h.quantity} UNITS</span>
                          <span className="text-slate-700">•</span>
                          <span className="text-emerald-500 uppercase">{stockInfo[h.ticker]?.payoutFrequency || '---'}</span>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setHoldings(prev => prev.filter(item => item.id !== h.id))}
                      className="text-slate-800 hover:text-rose-500 p-2 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <i className="fas fa-trash-alt text-xs"></i>
                    </button>
                  </div>
                ))}
                {holdings.length === 0 && (
                  <div className="text-center py-16 opacity-20">
                    <i className="fas fa-database text-4xl mb-4"></i>
                    <p className="text-xs font-black uppercase tracking-[0.2em]">Inventory Empty</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="lg:col-span-2">
            <ProjectionChart data={projectionData} />
            <div className="mt-8 bg-slate-900/40 backdrop-blur-sm p-6 rounded-3xl border border-slate-800/50">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Grounded Research Context</h4>
              </div>
              <div className="flex flex-wrap gap-3">
                {Object.values(stockInfo).flatMap(info => info.sources).slice(0, 10).map((s, i) => (
                  <a 
                    key={i} 
                    href={s.uri} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="group text-[10px] text-indigo-400/70 hover:text-indigo-300 hover:bg-indigo-500/10 px-4 py-2 rounded-xl border border-indigo-500/10 transition-all flex items-center gap-2 bg-slate-900/50"
                  >
                    <i className="fas fa-external-link-alt text-[8px] group-hover:scale-125 transition-transform"></i>
                    <span className="max-w-[150px] truncate font-bold">{s.title}</span>
                  </a>
                ))}
                {Object.values(stockInfo).length === 0 && (
                  <p className="text-[10px] text-slate-700 font-bold uppercase tracking-widest py-4 w-full text-center">Awaiting market discovery...</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;

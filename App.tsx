
import React, { useState, useEffect, useMemo } from 'react';
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
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [isInitialCheckDone, setIsInitialCheckDone] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Initial connection check
  useEffect(() => {
    const checkKey = async () => {
      // Check if we are in the AI Studio environment
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else {
        // In other environments, we check if the key is already present in process.env
        setHasApiKey(!!process.env.API_KEY);
      }
      setIsInitialCheckDone(true);
    };
    checkKey();
  }, []);

  const handleOpenKeyPicker = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      try {
        await window.aistudio.openSelectKey();
        // GUIDELINE: Assume key selection was successful after triggering openSelectKey()
        setHasApiKey(true);
        setError(null);
        setIsSettingsOpen(false);
      } catch (err) {
        console.error("Failed to open key picker", err);
        setError("Could not open the API key selector. Please refresh the page.");
      }
    } else {
      setError("API Key selector is only available within the AI Studio environment.");
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
      if (err.message === "MISSING_API_KEY" || err.message?.includes("API key") || err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        setError("Connection lost. Please reconnect your API key to continue fetching data.");
      } else {
        setError(`Failed to fetch ${ticker}. Please verify the symbol is correct.`);
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
      if (err.message === "MISSING_API_KEY" || err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        setError("API Session expired. Reconnection required for AI analysis.");
      } else {
        setError("Analysis failed. Please try again in a few moments.");
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

  if (isInitialCheckDone && !hasApiKey) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 selection:bg-indigo-500/30">
        <div className="bg-slate-900 border border-slate-800 p-10 rounded-[2.5rem] shadow-2xl max-w-lg w-full text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600"></div>
          
          <div className="w-24 h-24 bg-indigo-600/10 rounded-3xl flex items-center justify-center mb-8 mx-auto border border-indigo-500/20 transform rotate-12">
            <i className="fas fa-lock-open text-4xl text-indigo-400 -rotate-12"></i>
          </div>
          
          <h1 className="text-3xl font-black text-white mb-4 tracking-tight uppercase">DiviTrack <span className="text-indigo-500">Pro</span></h1>
          <p className="text-slate-400 text-sm mb-10 leading-relaxed px-4">
            Our high-performance financial engine requires a secure connection to the Gemini API to fetch real-time data and grounded projections.
          </p>
          
          <div className="space-y-4">
            <button 
              onClick={handleOpenKeyPicker}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 active:scale-95 group"
            >
              <i className="fas fa-key group-hover:rotate-12 transition-transform"></i>
              Connect System Key
            </button>
            
            <div className="flex flex-col gap-2 pt-4">
              <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-slate-500 hover:text-indigo-400 transition flex items-center justify-center gap-2"
              >
                <i className="fas fa-info-circle"></i>
                Required: Paid GCP Project with Search Grounding
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12 bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
      <nav className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 p-4 sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-600/20">
              <i className="fas fa-chart-line text-white text-lg"></i>
            </div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                DiviTrack <span className="text-indigo-500">Pro</span>
                <span className="bg-slate-800 text-[8px] px-1.5 py-0.5 rounded-md text-slate-500 border border-slate-700">v2.5</span>
              </h1>
              <div className="flex items-center gap-1.5 -mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${hasApiKey ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-rose-500 shadow-[0_0_5px_#ef4444]'} animate-pulse`}></div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  {hasApiKey ? 'Engine Operational' : 'Offline Mode'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="relative">
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`flex items-center gap-3 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all border ${isSettingsOpen ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-indigo-500/50'}`}
            >
              <i className={`fas fa-cog ${isSettingsOpen ? 'rotate-90' : ''} transition-transform`}></i>
              Settings
            </button>

            {isSettingsOpen && (
              <div className="absolute right-0 mt-3 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 animate-in fade-in slide-in-from-top-2 z-50">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-800 pb-2">System Controls</h3>
                <div className="space-y-2">
                  <button 
                    onClick={handleOpenKeyPicker}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl transition text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <i className="fas fa-key text-indigo-400 text-xs"></i>
                      <span className="text-xs font-bold">Update API Key</span>
                    </div>
                    <i className="fas fa-chevron-right text-[10px] text-slate-600 group-hover:translate-x-1 transition-transform"></i>
                  </button>
                  <button 
                    onClick={() => { localStorage.clear(); window.location.reload(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 bg-slate-800/50 hover:bg-rose-900/20 hover:text-rose-400 rounded-xl transition text-left"
                  >
                    <i className="fas fa-trash-alt text-xs"></i>
                    <span className="text-xs font-bold">Reset All Data</span>
                  </button>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800">
                  <p className="text-[9px] text-slate-600 leading-tight">
                    API Status: <span className={hasApiKey ? 'text-emerald-500' : 'text-rose-500'}>{hasApiKey ? 'Connected' : 'Missing'}</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/50 p-4 rounded-2xl mb-8 flex items-center justify-between text-rose-300 animate-in slide-in-from-top-4">
            <div className="flex items-center gap-3">
              <i className="fas fa-circle-exclamation text-lg"></i>
              <div>
                <p className="text-xs font-bold uppercase tracking-tight">System Alert</p>
                <p className="text-xs opacity-80">{error}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!hasApiKey && (
                <button onClick={handleOpenKeyPicker} className="text-[10px] font-black uppercase bg-rose-500/20 hover:bg-rose-500/30 px-3 py-1.5 rounded-lg transition">
                  Reconnect
                </button>
              )}
              <button onClick={() => setError(null)} className="text-rose-500/50 hover:text-rose-500 p-2">
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
            
            <div className="bg-slate-800 p-6 rounded-[1.5rem] border border-slate-700 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Live Portfolio</h3>
                <span className="text-[10px] font-black bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-md">
                  {holdings.length} Positions
                </span>
              </div>
              <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                {holdings.map(h => (
                  <div key={h.id} className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/50 flex items-center justify-between group hover:border-indigo-500/40 transition-all">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-black text-indigo-400 text-sm tracking-tighter">{h.ticker}</span>
                        <span className="text-[10px] text-slate-500 font-medium truncate max-w-[100px]">{stockInfo[h.ticker]?.name}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-3">
                        <span className="font-bold">{h.quantity} Shares</span>
                        <span className="text-emerald-500/80 font-black">{stockInfo[h.ticker]?.yield}% Yield</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setHoldings(prev => prev.filter(item => item.id !== h.id))}
                      className="text-slate-700 hover:text-rose-500 p-2 transition-colors"
                    >
                      <i className="fas fa-minus-circle"></i>
                    </button>
                  </div>
                ))}
                {holdings.length === 0 && (
                  <div className="text-center py-10 opacity-30">
                    <i className="fas fa-layer-group text-3xl mb-3"></i>
                    <p className="text-xs font-bold uppercase tracking-widest">No Holdings</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="lg:col-span-2">
            <ProjectionChart data={projectionData} />
            <div className="mt-8 bg-slate-900/40 backdrop-blur-sm p-5 rounded-2xl border border-slate-800/50">
              <div className="flex items-center gap-2 mb-4">
                <i className="fas fa-quote-left text-indigo-500/40 text-xs"></i>
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Data Grounding Citations</h4>
              </div>
              <div className="flex flex-wrap gap-3">
                {Object.values(stockInfo).flatMap(info => info.sources).slice(0, 8).map((s, i) => (
                  <a 
                    key={i} 
                    href={s.uri} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[10px] text-indigo-400/80 hover:text-indigo-400 hover:bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20 transition-all flex items-center gap-2"
                  >
                    <i className="fas fa-link text-[8px]"></i>
                    {s.title}
                  </a>
                ))}
                {Object.values(stockInfo).length === 0 && (
                  <p className="text-[10px] text-slate-600 italic">Awaiting citations from search tool...</p>
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

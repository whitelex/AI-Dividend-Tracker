
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
  const [isKeySelected, setIsKeySelected] = useState<boolean | null>(null);

  // Initial connection check
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const selected = await window.aistudio.hasSelectedApiKey();
        setIsKeySelected(selected);
      } else {
        // Fallback for non-managed environments if necessary
        setIsKeySelected(!!process.env.API_KEY);
      }
    };
    checkKey();
  }, []);

  const handleOpenKeyPicker = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      try {
        await window.aistudio.openSelectKey();
        // GUIDELINE: Assume success and proceed to app immediately
        setIsKeySelected(true);
        setError(null);
      } catch (err) {
        console.error("Failed to open key picker", err);
      }
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
      if (err.message?.includes("Requested entity was not found")) {
        // GUIDELINE: Reset key selection if this specific error occurs
        setIsKeySelected(false);
        setError("API Session expired or project not found. Please re-select your key.");
      } else {
        setError(`Data Retrieval Error: Could not fetch information for ${ticker}.`);
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
      if (err.message?.includes("Requested entity was not found")) {
        setIsKeySelected(false);
      }
      setError("AI analysis failed. Please verify your connection.");
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
    // Fix: Explicitly type stocks as DividendData[] to ensure TS correctly identifies properties in reduce
    const stocks = Object.values(stockInfo) as DividendData[];
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

  // Mandatory Key Selection Screen
  if (isKeySelected === false) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-6 font-sans">
        <div className="bg-slate-900 border border-slate-800 p-10 rounded-[2.5rem] shadow-2xl max-w-lg w-full text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-600 to-purple-600"></div>
          
          <div className="w-20 h-20 bg-indigo-600/10 rounded-3xl flex items-center justify-center mb-8 mx-auto border border-indigo-500/20">
            <i className="fas fa-key text-3xl text-indigo-400"></i>
          </div>
          
          <h1 className="text-3xl font-black text-white mb-4 uppercase tracking-tight">DiviTrack <span className="text-indigo-500">Pro</span></h1>
          <p className="text-slate-400 text-sm mb-10 leading-relaxed px-4">
            To provide real-time market data grounded in Google Search, visitors must connect their own API key from a paid GCP project.
          </p>
          
          <div className="space-y-4">
            <button 
              onClick={handleOpenKeyPicker}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl transition shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              <i className="fas fa-plug"></i>
              Connect My API Key
            </button>
            
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300 font-bold transition block"
            >
              Required: Paid Project Documentation
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Loading screen during initial check
  if (isKeySelected === null) {
    return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center"><i className="fas fa-circle-notch animate-spin text-indigo-500 text-4xl"></i></div>;
  }

  return (
    <div className="min-h-screen pb-12 bg-[#0f172a] text-slate-50 font-sans selection:bg-indigo-500/30">
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
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981] animate-pulse"></div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  Live Market Engine
                </span>
              </div>
            </div>
          </div>
          
          <button 
            onClick={handleOpenKeyPicker}
            className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all border bg-slate-800 border-slate-700 text-slate-400 hover:border-indigo-500/50 active:scale-95"
          >
            <i className="fas fa-key"></i>
            Change Key
          </button>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/50 p-4 rounded-2xl mb-8 flex items-center justify-between text-rose-300 animate-in slide-in-from-top-4 shadow-xl">
            <div className="flex items-center gap-4">
              <i className="fas fa-circle-exclamation text-lg"></i>
              <p className="text-xs font-medium">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-rose-500/50 hover:text-rose-500 p-2">
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}

        <Dashboard summary={portfolioSummary} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <StockForm onAdd={addHolding} isLoading={isLoading} />
            <PortfolioAnalysis onAnalyze={runAnalysis} analysis={analysisResult} isLoading={isAnalyzing} hasData={holdings.length > 0} />
            
            <div className="bg-slate-800 p-6 rounded-[2rem] border border-slate-700 shadow-2xl relative overflow-hidden">
              <div className="flex justify-between items-center mb-6">
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
                        <span className="font-black text-slate-100 text-sm tracking-tighter block">{h.ticker}</span>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2 font-bold">
                          <span>{h.quantity} UNITS</span>
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
                    <p className="text-xs font-black uppercase tracking-[0.2em]">Portfolio Empty</p>
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
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Research Citations</h4>
              </div>
              <div className="flex flex-wrap gap-3">
                {/* Fix: Explicitly type stocks as DividendData[] to ensure sources property is found during flatMap */}
                {(Object.values(stockInfo) as DividendData[]).flatMap(info => info.sources).slice(0, 10).map((s, i) => (
                  <a 
                    key={i} 
                    href={s.uri} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="group text-[10px] text-indigo-400/70 hover:text-indigo-300 hover:bg-indigo-500/10 px-4 py-2 rounded-xl border border-indigo-500/10 transition-all flex items-center gap-2 bg-slate-900/50"
                  >
                    <i className="fas fa-external-link-alt text-[8px]"></i>
                    <span className="max-w-[150px] truncate font-bold">{s.title}</span>
                  </a>
                ))}
                {Object.values(stockInfo).length === 0 && (
                  <p className="text-[10px] text-slate-700 font-bold uppercase tracking-widest py-4 w-full text-center">Add stocks to see source grounding...</p>
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

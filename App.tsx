
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
  const [isLive, setIsLive] = useState<boolean>(false);

  // Initial check for API connection
  useEffect(() => {
    const checkConnection = async () => {
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setIsLive(hasKey);
      } else {
        setIsLive(!!process.env.API_KEY);
      }
    };
    checkConnection();
  }, []);

  const handleConnect = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      try {
        await window.aistudio.openSelectKey();
        setIsLive(true);
        setError(null);
      } catch (err) {
        console.error("Connection failed", err);
      }
    } else {
      alert("Please ensure your API key is configured in the environment variables or platform settings.");
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
      if (err.message?.includes("API key") || err.message?.includes("401") || err.message?.includes("Requested entity was not found")) {
        setIsLive(false);
        setError("API Connection Required. Please click 'Connect Key' to authorize market data requests.");
      } else {
        setError(`Failed to fetch ${ticker}. Please check the symbol and try again.`);
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
      setError("AI analysis unavailable. Verify your API connection.");
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
      shares += priceBase > 0 ? (income / priceBase) : 0;
      divPerShare *= (1 + avgGrowth);
      priceBase *= 1.05; priceBear *= 1.01; priceBull *= 1.09;
    }
    return points;
  }, [portfolioSummary, stockInfo]);

  return (
    <div className="min-h-screen pb-12 bg-[#0f172a] text-slate-50 font-sans selection:bg-indigo-500/30">
      <nav className="bg-slate-900/50 backdrop-blur-xl border-b border-white/5 p-4 sticky top-0 z-[100]">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center">
              <i className="fas fa-chart-pie text-white"></i>
            </div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                DiviTrack <span className="text-indigo-500">Pro</span>
              </h1>
              <div className="flex items-center gap-1.5 -mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-slate-600'} animate-pulse`}></div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  {isLive ? 'Live Market Engine' : 'Offline Mode'}
                </span>
              </div>
            </div>
          </div>
          
          <button 
            onClick={handleConnect}
            className={`flex items-center gap-3 text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all border ${isLive ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-indigo-600 border-indigo-500 text-white shadow-xl shadow-indigo-600/20'} active:scale-95`}
          >
            <i className="fas fa-plug"></i>
            {isLive ? 'Update Key' : 'Connect Key'}
          </button>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl mb-8 flex items-center justify-between text-rose-300 animate-in slide-in-from-top-4 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center text-xs">
                <i className="fas fa-exclamation-triangle"></i>
              </div>
              <p className="text-xs font-bold uppercase tracking-tight">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-slate-500 hover:text-white p-2">
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}

        <Dashboard summary={portfolioSummary} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <StockForm onAdd={addHolding} isLoading={isLoading} />
            <PortfolioAnalysis onAnalyze={runAnalysis} analysis={analysisResult} isLoading={isAnalyzing} hasData={holdings.length > 0} />
            
            <div className="bg-slate-800/40 backdrop-blur-sm p-6 rounded-[2rem] border border-white/5 shadow-2xl relative overflow-hidden">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Asset Portfolio</h3>
                <span className="text-[9px] font-black bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/20">
                  {holdings.length} Positions
                </span>
              </div>
              <div className="space-y-3 max-h-[440px] overflow-y-auto custom-scrollbar pr-1">
                {holdings.map(h => (
                  <div key={h.id} className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 flex items-center justify-between group hover:border-indigo-500/30 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-black text-slate-300 text-[10px] border border-white/5">
                        {h.ticker.substring(0, 3)}
                      </div>
                      <div>
                        <span className="font-black text-white text-sm tracking-tighter block">{h.ticker}</span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase">{h.quantity} Shares</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setHoldings(prev => prev.filter(item => item.id !== h.id))}
                      className="text-slate-700 hover:text-rose-500 p-2 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <i className="fas fa-trash-alt text-xs"></i>
                    </button>
                  </div>
                ))}
                {holdings.length === 0 && (
                  <div className="text-center py-16 opacity-10">
                    <i className="fas fa-layer-group text-4xl mb-4"></i>
                    <p className="text-xs font-black uppercase tracking-[0.2em]">Add assets to start</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="lg:col-span-2 space-y-8">
            <ProjectionChart data={projectionData} />
            <div className="bg-slate-900/40 p-6 rounded-[2.5rem] border border-white/5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Market Citations & Grounding</h4>
              </div>
              <div className="flex flex-wrap gap-3">
                {(Object.values(stockInfo) as DividendData[]).flatMap(info => info.sources).slice(0, 10).map((s, i) => (
                  <a 
                    key={i} 
                    href={s.uri} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="group text-[10px] text-indigo-400/80 hover:text-indigo-300 hover:bg-indigo-500/10 px-4 py-2.5 rounded-xl border border-indigo-500/10 transition-all flex items-center gap-2 bg-slate-900/80"
                  >
                    <i className="fas fa-link text-[8px] opacity-40 group-hover:opacity-100 transition-opacity"></i>
                    <span className="max-w-[160px] truncate font-bold uppercase tracking-tight">{s.title}</span>
                  </a>
                ))}
                {Object.values(stockInfo).length === 0 && (
                  <div className="w-full text-center py-6">
                    <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Grounding sources will appear here as you add stocks.</p>
                  </div>
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

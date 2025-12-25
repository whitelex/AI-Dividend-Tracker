
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
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Check connection status silently
  useEffect(() => {
    const checkStatus = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setIsConnected(hasKey);
      } else {
        setIsConnected(!!process.env.API_KEY);
      }
    };
    checkStatus();
  }, []);

  const handleConnect = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setIsConnected(true);
      setError(null);
    } else {
      alert("API Key injection is handled by the platform. Ensure you are in a supported environment.");
    }
  };

  // Persistent storage for multi-user experience (local to their browser)
  useEffect(() => {
    const saved = localStorage.getItem('divitrack_holdings');
    const savedInfo = localStorage.getItem('divitrack_info');
    if (saved) setHoldings(JSON.parse(saved));
    if (savedInfo) setStockInfo(JSON.parse(savedInfo));
  }, []);

  useEffect(() => {
    localStorage.setItem('divitrack_holdings', JSON.stringify(holdings));
    localStorage.setItem('divitrack_info', JSON.stringify(stockInfo));
  }, [holdings, stockInfo]);

  const addHolding = async (ticker: string, quantity: number, date: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!stockInfo[ticker]) {
        const data = await fetchStockDividendData(ticker);
        if (data) setStockInfo(prev => ({ ...prev, [ticker]: data }));
      }
      const newHolding: StockHolding = {
        id: Math.random().toString(36).substr(2, 9),
        ticker: ticker.toUpperCase(),
        quantity,
        purchaseDate: date,
      };
      setHoldings(prev => [...prev, newHolding]);
    } catch (err: any) {
      if (err.message?.includes("API key") || err.message?.includes("401")) {
        setError("API Key required. Please click 'Connect Key' to enable market data.");
        setIsConnected(false);
      } else {
        setError(`Could not find data for ${ticker}. Please check the symbol.`);
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
      setError("AI Engine offline. Verify your API connection.");
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
    <div className="min-h-screen pb-12 bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
      <nav className="bg-slate-900/40 backdrop-blur-xl border-b border-white/5 p-4 sticky top-0 z-[100]">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <i className="fas fa-chart-line text-white text-sm"></i>
            </div>
            <div>
              <h1 className="text-xs font-black uppercase tracking-[0.2em]">
                DiviTrack <span className="text-indigo-500">Pro</span>
              </h1>
              <div className="flex items-center gap-1.5 -mt-0.5">
                <div className={`w-1 h-1 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-slate-600'}`}></div>
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                  {isConnected ? 'Market Ready' : 'Connection Required'}
                </span>
              </div>
            </div>
          </div>
          
          <button 
            onClick={handleConnect}
            className={`text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all border ${isConnected ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-indigo-600 border-indigo-500 text-white shadow-lg'} active:scale-95`}
          >
            {isConnected ? 'Change API Key' : 'Connect Key'}
          </button>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl mb-8 flex items-center justify-between text-rose-400 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <i className="fas fa-shield-virus text-xs"></i>
              <p className="text-[10px] font-black uppercase tracking-tight">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="opacity-50 hover:opacity-100 px-2 text-sm">&times;</button>
          </div>
        )}

        <Dashboard summary={portfolioSummary} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <StockForm onAdd={addHolding} isLoading={isLoading} />
            <PortfolioAnalysis onAnalyze={runAnalysis} analysis={analysisResult} isLoading={isAnalyzing} hasData={holdings.length > 0} />
            
            <div className="bg-slate-900/40 p-6 rounded-3xl border border-white/5 shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Holdings</h3>
                <span className="text-[9px] font-black text-slate-400">{holdings.length} Assets</span>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {holdings.map(h => (
                  <div key={h.id} className="bg-slate-800/40 p-3 rounded-xl border border-white/5 flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center font-black text-indigo-400 text-[10px]">
                        {h.ticker.substring(0, 3)}
                      </div>
                      <div>
                        <span className="font-black text-white text-xs block">{h.ticker}</span>
                        <span className="text-[9px] text-slate-500 font-bold uppercase">{h.quantity} Shares</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setHoldings(prev => prev.filter(item => item.id !== h.id))}
                      className="text-slate-700 hover:text-rose-500 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <i className="fas fa-trash-alt text-[10px]"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="lg:col-span-2 space-y-6">
            <ProjectionChart data={projectionData} />
            <div className="bg-slate-900/20 p-4 rounded-2xl border border-white/5 flex flex-wrap gap-2">
              <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest mr-2 py-1">Sources:</span>
              {(Object.values(stockInfo) as DividendData[]).flatMap(info => info.sources).slice(0, 8).map((s, i) => (
                <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer" className="text-[8px] font-bold text-indigo-400/60 hover:text-indigo-300 hover:bg-indigo-500/10 px-2 py-1 rounded transition-colors uppercase border border-indigo-500/10">
                  {s.title}
                </a>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;

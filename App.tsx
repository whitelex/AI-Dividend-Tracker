
import React, { useState, useEffect, useMemo } from 'react';
import { StockHolding, DividendData, PortfolioSummary, ProjectionPoint } from './types';
import { fetchStockDividendData, analyzePortfolio } from './services/geminiService';
import StockForm from './components/StockForm';
import Dashboard from './components/Dashboard';
import ProjectionChart from './components/ProjectionChart';
import PortfolioAnalysis from './components/PortfolioAnalysis';

// Fix: define AIStudio interface and update Window declaration to match environment expectations
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

  // Initial connection check
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else {
        // Assume key is provided via env if not in aistudio managed environment
        setHasApiKey(true);
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
      // GUIDELINE: Handle "Requested entity was not found" by resetting key state
      if (err.message === "MISSING_API_KEY" || err.message?.includes("API key") || err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        if (err.message?.includes("Requested entity was not found")) {
          setError("Session invalid or project not found. Please select a paid API key again.");
          if (window.aistudio) window.aistudio.openSelectKey();
        } else {
          setError("API Key missing. Please connect to continue.");
        }
      } else {
        setError("Failed to fetch market data. Please verify the ticker symbol.");
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
      if (err.message === "MISSING_API_KEY" || err.message?.includes("API key") || err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        if (err.message?.includes("Requested entity was not found")) {
          setError("Session invalid. Please select a paid API key again.");
          if (window.aistudio) window.aistudio.openSelectKey();
        } else {
          setError("API Key issues detected. Please reconnect.");
        }
      } else {
        setError("AI analysis failed. Please check your connection.");
      }
    } finally {
      // Fixed: corrected setIsLoading to setIsAnalyzing
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

  if (isInitialCheckDone && !hasApiKey && window.aistudio) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 p-10 rounded-3xl shadow-2xl max-w-lg w-full text-center">
          <div className="w-20 h-20 bg-indigo-600/10 rounded-full flex items-center justify-center mb-6 mx-auto border border-indigo-500/20">
            <i className="fas fa-plug text-3xl text-indigo-400"></i>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Connect Financial Engine</h1>
          <p className="text-slate-400 text-sm mb-8">
            DiviTrack Pro uses the Gemini API to provide grounded market research. Please select your API key from a paid GCP project to continue.
          </p>
          <button 
            onClick={handleOpenKeyPicker}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 mb-4"
          >
            <i className="fas fa-key"></i>
            Select API Key
          </button>
          {/* GUIDELINE: Added link to billing documentation */}
          <a 
            href="https://ai.google.dev/gemini-api/docs/billing" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-indigo-400 hover:underline block mb-4"
          >
            Billing Setup Documentation
          </a>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
            Required: Paid GCP Project with Search Grounding
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12 bg-slate-950 text-slate-50 font-sans">
      <nav className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 p-4 sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <i className="fas fa-chart-line text-white"></i>
            </div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-tighter">DiviTrack <span className="text-indigo-500">Pro</span></h1>
              <button 
                onClick={handleOpenKeyPicker}
                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
              >
                <div className={`w-1.5 h-1.5 rounded-full ${hasApiKey ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`}></div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  {hasApiKey ? 'System Online' : 'Connect Required'}
                </span>
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handleOpenKeyPicker}
              className="text-[10px] font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition text-slate-400"
            >
              <i className="fas fa-cog mr-2"></i> Settings
            </button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/50 p-4 rounded-xl mb-8 flex items-center justify-between text-rose-300">
            <div className="flex items-center gap-3">
              <i className="fas fa-exclamation-circle"></i>
              <p className="text-xs font-medium">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-rose-500 p-1">
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}

        <Dashboard summary={portfolioSummary} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <StockForm onAdd={addHolding} isLoading={isLoading} />
            <PortfolioAnalysis onAnalyze={runAnalysis} analysis={analysisResult} isLoading={isAnalyzing} hasData={holdings.length > 0} />
            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Active Assets</h3>
              <div className="space-y-2">
                {holdings.map(h => (
                  <div key={h.id} className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/50 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-indigo-400 mr-2">{h.ticker}</span>
                      <span className="text-[10px] text-slate-500">{h.quantity} Shares</span>
                    </div>
                    <button 
                      onClick={() => setHoldings(prev => prev.filter(item => item.id !== h.id))}
                      className="text-slate-700 hover:text-rose-500 transition"
                    >
                      <i className="fas fa-trash-alt text-xs"></i>
                    </button>
                  </div>
                ))}
                {holdings.length === 0 && <p className="text-center py-4 text-xs text-slate-600">No assets added.</p>}
              </div>
            </div>
          </div>
          <div className="lg:col-span-2">
            <ProjectionChart data={projectionData} />
            <div className="mt-8 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">Grounded Citations</p>
              <div className="flex flex-wrap gap-4">
                {Object.values(stockInfo).flatMap(info => info.sources).slice(0, 6).map((s, i) => (
                  <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-400 hover:underline">
                    {s.title}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;

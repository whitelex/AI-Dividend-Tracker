
import React, { useState, useEffect, useMemo } from 'react';
import { StockHolding, DividendData, PortfolioSummary, ProjectionPoint } from './types';
import { fetchStockDividendData, analyzePortfolio } from './services/geminiService';
import StockForm from './components/StockForm';
import Dashboard from './components/Dashboard';
import ProjectionChart from './components/ProjectionChart';
import PortfolioAnalysis from './components/PortfolioAnalysis';

declare global {
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
  const [showSettings, setShowSettings] = useState(false);

  // Check API Key selection status on initialization.
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else {
        // Fallback for environments where process.env.API_KEY is handled externally
        setHasApiKey(true);
      }
      setIsInitialCheckDone(true);
    };
    checkKey();
  }, []);

  // Handle the API key selection dialog.
  const handleOpenKeyPicker = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      try {
        await window.aistudio.openSelectKey();
        // Mandatory requirement: Assume selection success after triggering the dialog.
        setHasApiKey(true);
        setShowSettings(false);
      } catch (err) {
        console.error("Failed to open key picker", err);
      }
    }
  };

  // Persist and load portfolio data
  useEffect(() => {
    const savedHoldings = localStorage.getItem('divi_holdings');
    const savedInfo = localStorage.getItem('divi_stock_info');
    const savedAnalysis = localStorage.getItem('divi_analysis');
    if (savedHoldings) setHoldings(JSON.parse(savedHoldings));
    if (savedInfo) setStockInfo(JSON.parse(savedInfo));
    if (savedAnalysis) setAnalysisResult(savedAnalysis);
  }, []);

  useEffect(() => {
    localStorage.setItem('divi_holdings', JSON.stringify(holdings));
    localStorage.setItem('divi_stock_info', JSON.stringify(stockInfo));
    if (analysisResult) localStorage.setItem('divi_analysis', analysisResult);
  }, [holdings, stockInfo, analysisResult]);

  const addHolding = async (ticker: string, quantity: number, date: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!stockInfo[ticker]) {
        const data = await fetchStockDividendData(ticker);
        if (data) {
          setStockInfo(prev => ({ ...prev, [ticker]: data }));
          setAnalysisResult(null); 
        } else {
          setError(`Data fetch failed for ${ticker}. Ensure you are using a valid ticker symbol.`);
          setIsLoading(false);
          return;
        }
      }
      const newHolding: StockHolding = {
        id: Math.random().toString(36).substr(2, 9),
        ticker: ticker.toUpperCase(),
        quantity,
        purchaseDate: date,
      };
      setHoldings(prev => [...prev, newHolding]);
      setAnalysisResult(null); 
    } catch (err: any) {
      if (err.message?.includes("Requested entity was not found") || err.message?.includes("403") || err.message?.includes("API key")) {
        setHasApiKey(false);
        setError("Your API session has expired or is invalid. Please re-select your key.");
      } else {
        setError("An error occurred while communicating with the financial engine.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const runAnalysis = async () => {
    if (holdings.length === 0) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzePortfolio(holdings, stockInfo);
      setAnalysisResult(result);
    } catch (err: any) {
      if (err.message?.includes("Requested entity was not found")) setHasApiKey(false);
      setError("AI analysis failed. Please verify your connection settings.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const removeHolding = (id: string) => {
    setHoldings(prev => prev.filter(h => h.id !== id));
    setAnalysisResult(null);
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
    const avgDivGrowth = Object.values(stockInfo).length > 0 
      ? Object.values(stockInfo).reduce((acc, curr) => acc + (curr.growthRate || 0), 0) / Object.values(stockInfo).length / 100
      : 0.07;
    const initialAvgPrice = portfolioSummary.totalValue / (portfolioSummary.totalShares || 1);
    const initialAnnualDiv = portfolioSummary.annualIncome / (portfolioSummary.totalShares || 1);

    let shares = portfolioSummary.totalShares, divPerShare = initialAnnualDiv;
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
      divPerShare *= (1 + avgDivGrowth);
      priceBase *= 1.05; priceBear *= 1.01; priceBull *= 1.09;
    }
    return points;
  }, [portfolioSummary, stockInfo]);

  // MANDATORY CONNECTION OVERLAY
  if (isInitialCheckDone && !hasApiKey && window.aistudio) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-slate-900 border border-slate-800 p-10 rounded-3xl shadow-2xl max-w-lg w-full relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"></div>
          <div className="w-24 h-24 bg-indigo-600/10 rounded-full flex items-center justify-center mb-8 mx-auto border border-indigo-500/20">
            <i className="fas fa-shield-halved text-4xl text-indigo-400"></i>
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">Financial Engine Locked</h1>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed px-4">
            DiviTrack Pro requires a secure connection to the Gemini API to fetch real-time financial data and ground projections in Google Search.
          </p>
          <div className="bg-slate-800/50 p-6 rounded-2xl mb-8 text-left border border-slate-700/50">
            <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-3">Requirements</h4>
            <ul className="space-y-3 text-xs text-slate-300">
              <li className="flex gap-3 items-start">
                <i className="fas fa-check-circle text-emerald-500 mt-0.5"></i>
                <span>API Key from a paid Google Cloud project.</span>
              </li>
              <li className="flex gap-3 items-start">
                <i className="fas fa-check-circle text-emerald-500 mt-0.5"></i>
                <span>Search Tooling enabled for grounding.</span>
              </li>
            </ul>
          </div>
          <button 
            onClick={handleOpenKeyPicker}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 mb-6 active:scale-95"
          >
            <i className="fas fa-key"></i>
            Configure API Connection
          </button>
          <div className="flex flex-col gap-2">
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-indigo-400 transition underline decoration-dotted">
              View Billing & Usage Documentation
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12 bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
      <nav className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 p-4 sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-600/20 rotate-3">
              <i className="fas fa-chart-pie text-white text-xl"></i>
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter uppercase">DiviTrack <span className="text-indigo-500">Pro</span></h1>
              <div className="flex items-center gap-1.5 -mt-1">
                <div className={`w-1.5 h-1.5 rounded-full ${hasApiKey ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  {hasApiKey ? 'System Operational' : 'Offline Mode'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 hover:border-indigo-500 transition flex items-center justify-center text-slate-400 hover:text-indigo-400"
              >
                <i className={`fas fa-cog ${showSettings ? 'rotate-90' : ''} transition-transform`}></i>
              </button>
              
              {showSettings && (
                <div className="absolute right-0 mt-3 w-64 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-4 animate-in fade-in slide-in-from-top-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">System Settings</h3>
                  <div className="space-y-2">
                    <button 
                      onClick={handleOpenKeyPicker}
                      className="w-full flex items-center gap-3 px-3 py-2.5 bg-slate-900/50 hover:bg-slate-700 rounded-xl transition text-left text-sm"
                    >
                      <i className="fas fa-key text-indigo-400 w-4"></i>
                      <span>Update API Key</span>
                    </button>
                    <button 
                      onClick={() => { localStorage.clear(); window.location.reload(); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 bg-slate-900/50 hover:bg-rose-900/20 hover:text-rose-400 rounded-xl transition text-left text-sm"
                    >
                      <i className="fas fa-trash-alt w-4"></i>
                      <span>Reset Local Data</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/50 p-4 rounded-2xl mb-8 flex items-center justify-between text-rose-300 animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3">
              <i className="fas fa-triangle-exclamation"></i>
              <p className="text-xs font-medium">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-400 p-1">
              <i className="fas fa-xmark"></i>
            </button>
          </div>
        )}

        <Dashboard summary={portfolioSummary} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <StockForm onAdd={addHolding} isLoading={isLoading} />
            <PortfolioAnalysis onAnalyze={runAnalysis} analysis={analysisResult} isLoading={isAnalyzing} hasData={holdings.length > 0} />
            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold text-white uppercase tracking-widest">Active Positions</h3>
                <span className="text-[10px] bg-indigo-600/20 text-indigo-400 px-2.5 py-1 rounded-full font-black">{holdings.length}</span>
              </div>
              {holdings.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 bg-slate-900/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-700/50">
                    <i className="fas fa-inbox text-slate-600"></i>
                  </div>
                  <p className="text-slate-500 text-xs italic">No holdings detected.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                  {holdings.map(h => (
                    <div key={h.id} className="bg-slate-900/50 p-3.5 rounded-xl border border-slate-700/50 flex items-center justify-between group hover:border-indigo-500/40 transition-all">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-indigo-400 tracking-tighter">{h.ticker}</span>
                          <span className="text-[10px] text-slate-500 truncate">{stockInfo[h.ticker]?.name}</span>
                        </div>
                        <div className="text-[9px] text-slate-500 flex items-center gap-3 mt-1 font-bold uppercase tracking-tight">
                          <span>{h.quantity} Shares</span>
                          <span className="text-emerald-500/80">{stockInfo[h.ticker]?.yield}% Yield</span>
                        </div>
                      </div>
                      <button onClick={() => removeHolding(h.id)} className="text-slate-700 hover:text-rose-500 transition p-2">
                        <i className="fas fa-minus-circle"></i>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="lg:col-span-2">
            <ProjectionChart data={projectionData} />
            <div className="mt-8 bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50">
              <h3 className="text-xs font-bold mb-4 text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <i className="fas fa-file-invoice text-indigo-400"></i>
                Financial Audit Trail
              </h3>
              <div className="space-y-4">
                {Object.values(stockInfo).some(info => info.sources.length > 0) ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.values(stockInfo).map(info => info.sources.length > 0 && (
                      <div key={info.ticker} className="bg-slate-900/30 p-3 rounded-xl border border-slate-700/30">
                        <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_5px_#6366f1]"></span>
                          {info.ticker} Grounding
                        </p>
                        <ul className="space-y-1.5">
                          {info.sources.map((s, idx) => (
                            <li key={idx} className="flex items-start gap-2 group">
                              <a href={s.uri} target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-400 hover:text-indigo-300 hover:underline line-clamp-1 transition-colors">
                                {s.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-600 text-[10px] uppercase font-bold tracking-widest text-center py-4">Awaiting Grounded Data...</p>
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

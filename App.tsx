
import React, { useState, useEffect, useMemo } from 'react';
import { StockHolding, DividendData, PortfolioSummary, ProjectionPoint } from './types';
import { fetchStockDividendData, analyzePortfolio } from './services/geminiService';
import StockForm from './components/StockForm';
import Dashboard from './components/Dashboard';
import ProjectionChart from './components/ProjectionChart';
import PortfolioAnalysis from './components/PortfolioAnalysis';

// Fix: Use the AIStudio nominal interface to match global environment declarations and avoid property re-declaration errors.
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
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);

  // Check API Key selection status on initialization.
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkKey();
  }, []);

  // Handle the API key selection dialog.
  const handleOpenKeyPicker = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      try {
        await window.aistudio.openSelectKey();
        // Race condition: Assume the key selection was successful after triggering openSelectKey() and proceed to the app.
        setHasApiKey(true);
      } catch (err) {
        console.error("Failed to open key picker", err);
      }
    }
  };

  // Load portfolio from local storage on mount.
  useEffect(() => {
    const savedHoldings = localStorage.getItem('divi_holdings');
    const savedInfo = localStorage.getItem('divi_stock_info');
    const savedAnalysis = localStorage.getItem('divi_analysis');
    if (savedHoldings) setHoldings(JSON.parse(savedHoldings));
    if (savedInfo) setStockInfo(JSON.parse(savedInfo));
    if (savedAnalysis) setAnalysisResult(savedAnalysis);
  }, []);

  // Persist portfolio changes to local storage.
  useEffect(() => {
    localStorage.setItem('divi_holdings', JSON.stringify(holdings));
    localStorage.setItem('divi_stock_info', JSON.stringify(stockInfo));
    if (analysisResult) {
      localStorage.setItem('divi_analysis', analysisResult);
    }
  }, [holdings, stockInfo, analysisResult]);

  // Adds a new stock holding and fetches dividend metadata if not already cached.
  const addHolding = async (ticker: string, quantity: number, date: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!stockInfo[ticker]) {
        const data = await fetchStockDividendData(ticker);
        if (data) {
          setStockInfo(prev => ({ ...prev, [ticker]: data }));
          setAnalysisResult(null); // Clear old analysis when portfolio changes
        } else {
          setError(`Could not find data for ticker: ${ticker}. Ensure your project has search enabled.`);
          setIsLoading(false);
          return;
        }
      }

      const newHolding: StockHolding = {
        id: Math.random().toString(36).substr(2, 9),
        ticker,
        quantity,
        purchaseDate: date,
      };

      setHoldings(prev => [...prev, newHolding]);
      setAnalysisResult(null); 
    } catch (err: any) {
      if (err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        setError("API Key error or invalid project. Please re-select your key.");
      } else {
        setError("An error occurred while adding the stock. Please try again.");
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
    } catch (err) {
      setError("Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Removes a holding from the portfolio.
  const removeHolding = (id: string) => {
    setHoldings(prev => prev.filter(h => h.id !== id));
    setAnalysisResult(null);
  };

  // Calculate high-level portfolio metrics.
  const portfolioSummary = useMemo<PortfolioSummary>(() => {
    let totalValue = 0;
    let annualIncome = 0;
    let totalShares = 0;

    holdings.forEach(h => {
      const data = stockInfo[h.ticker];
      totalShares += h.quantity;
      if (data) {
        totalValue += h.quantity * data.currentPrice;
        annualIncome += h.quantity * data.annualDividend;
      }
    });

    const weightedYield = totalValue > 0 ? (annualIncome / totalValue) * 100 : 0;

    return {
      totalValue,
      annualIncome,
      averageYield: weightedYield,
      yieldOnCost: weightedYield,
      totalShares,
    };
  }, [holdings, stockInfo]);

  // Generate 20-year compound growth projections.
  const projectionData = useMemo<ProjectionPoint[]>(() => {
    const points: ProjectionPoint[] = [];
    const initialInvestment = portfolioSummary.totalValue || 1;
    
    const avgDividendGrowth = Object.values(stockInfo).length > 0 
      ? Object.values(stockInfo).reduce((acc, curr) => acc + (curr.growthRate || 0), 0) / Object.values(stockInfo).length / 100
      : 0.07;
    
    const initialAvgPrice = portfolioSummary.totalValue / (portfolioSummary.totalShares || 1);
    const initialAnnualDivPerShare = portfolioSummary.annualIncome / (portfolioSummary.totalShares || 1);

    let currentShares = portfolioSummary.totalShares;
    let currentDivPerShare = initialAnnualDivPerShare;
    
    let priceBase = initialAvgPrice;
    let priceBear = initialAvgPrice;
    let priceBull = initialAvgPrice;

    const rateBase = 0.05;
    const rateBear = 0.01;
    const rateBull = 0.09;

    let cumulativeDividends = 0;

    for (let year = 0; year <= 20; year++) {
      const income = currentShares * currentDivPerShare;
      
      points.push({
        year,
        balance: Math.round(currentShares * priceBase),
        bearBalance: Math.round(currentShares * priceBear),
        bullBalance: Math.round(currentShares * priceBull),
        annualIncome: Math.round(income),
        cumulativeDividends: Math.round(cumulativeDividends),
        yoc: (income / initialInvestment) * 100,
        shares: Number(currentShares.toFixed(2))
      });

      cumulativeDividends += income;
      const newSharesFromDrip = priceBase > 0 ? income / priceBase : 0;
      currentShares += newSharesFromDrip;

      currentDivPerShare *= (1 + avgDividendGrowth);
      priceBase *= (1 + rateBase);
      priceBear *= (1 + rateBear);
      priceBull *= (1 + rateBull);
    }
    return points;
  }, [portfolioSummary, stockInfo]);

  return (
    <div className="min-h-screen pb-12 bg-slate-950 text-slate-50 font-sans">
      <nav className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-50 shadow-md">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
              <i className="fas fa-coins text-white text-xl"></i>
            </div>
            <h1 className="text-xl font-bold tracking-tight">DiviTrack <span className="text-indigo-500">Pro</span></h1>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-500 hidden lg:block mr-4 italic">
              "Compound interest is the eighth wonder of the world."
            </div>
            {window.aistudio && (
              <button 
                onClick={handleOpenKeyPicker}
                className={`text-xs font-bold py-1.5 px-4 rounded-full flex items-center gap-2 border transition-all ${
                  hasApiKey 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                  : 'bg-amber-500 text-slate-900 border-amber-600 hover:bg-amber-400 shadow-lg shadow-amber-500/20'
                }`}
              >
                <i className={`fas ${hasApiKey ? 'fa-check-circle' : 'fa-key'}`}></i>
                {hasApiKey ? 'API Connected' : 'Set API Key'}
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        {!hasApiKey && (
          <div className="bg-amber-500/10 border border-amber-500/50 p-4 rounded-xl mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <i className="fas fa-exclamation-triangle text-amber-500"></i>
              <p className="text-amber-200 text-sm">Please select a Google AI Studio API key from a paid GCP project (ai.google.dev/gemini-api/docs/billing) to fetch real-time stock data.</p>
            </div>
            <button 
              onClick={handleOpenKeyPicker}
              className="bg-amber-500 text-slate-900 font-bold px-4 py-1 rounded text-xs"
            >
              Select Key
            </button>
          </div>
        )}

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/50 p-4 rounded-xl mb-8 flex items-center gap-3 text-rose-300">
            <i className="fas fa-times-circle"></i>
            <p className="text-sm">{error}</p>
          </div>
        )}

        <Dashboard summary={portfolioSummary} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <StockForm onAdd={addHolding} isLoading={isLoading} />
            
            <PortfolioAnalysis 
              onAnalyze={runAnalysis} 
              analysis={analysisResult} 
              isLoading={isAnalyzing} 
              hasData={holdings.length > 0} 
            />

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">Your Holdings</h3>
                <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-1 rounded font-bold uppercase tracking-widest">{holdings.length} Positions</span>
              </div>
              {holdings.length === 0 ? (
                <p className="text-slate-500 text-sm italic text-center py-8">No holdings added yet.</p>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                  {holdings.map(h => (
                    <div key={h.id} className="bg-slate-900 p-3 rounded-lg border border-slate-700 flex items-center justify-between group hover:border-indigo-500/50 transition-colors">
                      <div className="flex-grow min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-indigo-400">{h.ticker}</span>
                          <span className="text-xs text-slate-500 truncate">{stockInfo[h.ticker]?.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-3 mt-0.5">
                          <span>{h.quantity} shares</span>
                          <span className="text-emerald-500/80 font-mono">Yield: {stockInfo[h.ticker]?.yield}%</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => removeHolding(h.id)}
                        className="text-slate-600 hover:text-rose-400 transition p-2"
                        title="Delete position"
                      >
                        <i className="fas fa-trash-alt text-sm"></i>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            <ProjectionChart data={projectionData} />
            
            <div className="mt-8 bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
              <h3 className="text-lg font-bold mb-4 text-white flex items-center gap-2">
                <i className="fas fa-info-circle text-indigo-400"></i>
                Data Sources & Grounding
              </h3>
              <div className="space-y-4">
                {Object.values(stockInfo).some(info => info.sources.length > 0) ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.values(stockInfo).map(info => (
                      info.sources.length > 0 && (
                        <div key={info.ticker} className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-indigo-500"></span>
                            {info.ticker} Citations
                          </p>
                          <ul className="space-y-1.5">
                            {info.sources.map((s, idx) => (
                              <li key={idx} className="flex items-start gap-2 group">
                                <i className="fas fa-link text-[10px] text-indigo-500/50 mt-1"></i>
                                <a href={s.uri} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-300 hover:text-indigo-200 hover:underline line-clamp-1">
                                  {s.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm italic">Add a stock to see information sources.</p>
                )}
                <div className="pt-6 border-t border-slate-700 flex flex-col md:flex-row gap-4 items-center">
                  <div className="flex-grow">
                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">About this Projection</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      This model uses current dividend yield and historical 5-year growth rates fetched via Gemini API with Google Search grounding. 
                      Projections assume all dividends are reinvested (DRIP) at the base case price. 
                      Past performance does not guarantee future results.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-900 px-4 py-2 rounded-lg border border-slate-700">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Engine Status</div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                      <span className="text-[11px] font-mono text-emerald-400">Live</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;

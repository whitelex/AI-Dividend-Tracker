
import React, { useState, useEffect, useMemo } from 'react';
import { StockHolding, DividendData, PortfolioSummary, ProjectionPoint } from './types';
import { fetchStockDividendData } from './services/geminiService';
import StockForm from './components/StockForm';
import Dashboard from './components/Dashboard';
import ProjectionChart from './components/ProjectionChart';

// Fix: Use the globally defined AIStudio type to prevent conflicting declarations and modifier mismatches.
declare global {
  interface Window {
    aistudio: AIStudio;
  }
}

const App: React.FC = () => {
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [stockInfo, setStockInfo] = useState<Record<string, DividendData>>({});
  const [isLoading, setIsLoading] = useState(false);
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
        // GUIDELINE: Assume success after triggering the picker to avoid race conditions.
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
    if (savedHoldings) setHoldings(JSON.parse(savedHoldings));
    if (savedInfo) setStockInfo(JSON.parse(savedInfo));
  }, []);

  // Persist portfolio changes to local storage.
  useEffect(() => {
    localStorage.setItem('divi_holdings', JSON.stringify(holdings));
    localStorage.setItem('divi_stock_info', JSON.stringify(stockInfo));
  }, [holdings, stockInfo]);

  // Adds a new stock holding and fetches dividend metadata if not already cached.
  const addHolding = async (ticker: string, quantity: number, date: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!stockInfo[ticker]) {
        const data = await fetchStockDividendData(ticker);
        if (data) {
          setStockInfo(prev => ({ ...prev, [ticker]: data }));
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
    } catch (err: any) {
      // GUIDELINE: Reset key selection if the request fails with "Requested entity was not found".
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

  // Removes a holding from the portfolio.
  const removeHolding = (id: string) => {
    setHoldings(prev => prev.filter(h => h.id !== id));
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
              <p className="text-amber-200 text-sm">Please select a Google AI Studio API key with billing enabled to fetch real-time stock data.</p>
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
            
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm">
              <h3 className="text-xl font-bold mb-4 text-white">Your Holdings</h3>
              {holdings.length === 0 ? (
                <p className="text-slate-500 text-sm italic">No holdings added yet.</p>
              ) : (
                <div className="space-y-3">
                  {holdings.map(h => (
                    <div key={h.id} className="bg-slate-900 p-3 rounded-lg border border-slate-700 flex items-center justify-between group">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-indigo-400">{h.ticker}</span>
                          <span className="text-xs text-slate-500">{stockInfo[h.ticker]?.name}</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          {h.quantity} shares @ {stockInfo[h.ticker]?.currentPrice ? `$${stockInfo[h.ticker].currentPrice}` : '...'}
                        </div>
                      </div>
                      <button 
                        onClick={() => removeHolding(h.id)}
                        className="text-slate-600 hover:text-rose-400 transition"
                      >
                        <i className="fas fa-trash-alt"></i>
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
                  Object.values(stockInfo).map(info => (
                    info.sources.length > 0 && (
                      <div key={info.ticker} className="space-y-2">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{info.ticker} Citations</p>
                        <ul className="list-disc list-inside text-sm text-indigo-300 space-y-1">
                          {info.sources.map((s, idx) => (
                            <li key={idx}>
                              <a href={s.uri} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                {s.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  ))
                ) : (
                  <p className="text-slate-500 text-sm italic">Add a stock to see information sources.</p>
                )}
                <div className="pt-4 border-t border-slate-700">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">About this Projection</p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    This model uses current dividend yield and historical 5-year growth rates fetched via Gemini API with Google Search grounding. 
                    Projections assume all dividends are reinvested (DRIP) at the base case price. 
                    Past performance does not guarantee future results.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// Fixed: Added missing default export.
export default App;

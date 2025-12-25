
import React, { useState, useEffect, useMemo } from 'react';
import { StockHolding, DividendData, PortfolioSummary, ProjectionPoint } from './types';
import { fetchStockDividendData, analyzePortfolio } from './services/geminiService';
import StockForm from './components/StockForm';
import Dashboard from './components/Dashboard';
import ProjectionChart from './components/ProjectionChart';
import PortfolioAnalysis from './components/PortfolioAnalysis';

const App: React.FC = () => {
  // Core Portfolio State
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [stockInfo, setStockInfo] = useState<Record<string, DividendData>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [error, setError] = useState<{message: string, type: 'error' | 'warning'} | null>(null);

  // API Key & Settings State
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [tempKey, setTempKey] = useState('');

  // Initial Data & Key Load
  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) {
      setApiKey(storedKey);
    } else {
      setShowSettings(true);
    }

    const savedHoldings = localStorage.getItem('divi_holdings');
    const savedInfo = localStorage.getItem('divi_stock_info');
    if (savedHoldings) setHoldings(JSON.parse(savedHoldings));
    if (savedInfo) setStockInfo(JSON.parse(savedInfo));
  }, []);

  // Persistence
  useEffect(() => {
    localStorage.setItem('divi_holdings', JSON.stringify(holdings));
    localStorage.setItem('divi_stock_info', JSON.stringify(stockInfo));
  }, [holdings, stockInfo]);

  const handleSaveKey = () => {
    if (tempKey.trim()) {
      localStorage.setItem('gemini_api_key', tempKey.trim());
      setApiKey(tempKey.trim());
      setShowSettings(false);
      setTempKey('');
      setError(null);
    }
  };

  const handleClearKey = () => {
    localStorage.removeItem('gemini_api_key');
    setApiKey('');
    setTempKey('');
  };

  const addHolding = async (ticker: string, quantity: number, date: string) => {
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      if (!stockInfo[ticker]) {
        const data = await fetchStockDividendData(ticker, apiKey);
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
      console.error("App Error:", err);
      const msg = err.message || "";
      if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
        setError({
          message: "API Limit Reached. Your account has a 5 RPM limit. Please wait 30-60 seconds before adding more stocks.",
          type: 'warning'
        });
      } else if (msg.includes("401") || msg.includes("403")) {
        setError({ message: "Invalid API Key. Please update your settings.", type: 'error' });
        setShowSettings(true);
      } else {
        setError({ message: `Could not retrieve data for ${ticker}. Check symbol and try again.`, type: 'error' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const runAnalysis = async () => {
    if (holdings.length === 0 || !apiKey) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await analyzePortfolio(holdings, stockInfo, apiKey);
      setAnalysisResult(result);
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("429")) {
        setError({ message: "Rate limit hit. Wait a minute and try again.", type: 'warning' });
      } else {
        setError({ message: "Analysis failed. Verify your key and portfolio data.", type: 'error' });
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
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <i className="fas fa-hand-holding-dollar text-white text-lg"></i>
            </div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-[0.2em]">
                DiviTrack <span className="text-indigo-500">Pro</span>
              </h1>
              <div className="flex items-center gap-1.5 -mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${apiKey ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500 animate-pulse'}`}></div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  {apiKey ? 'Live Analysis' : 'Action Required'}
                </span>
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all border bg-slate-800/50 border-slate-700 text-slate-300 hover:border-indigo-500/50 active:scale-95"
          >
            <i className="fas fa-cog"></i>
            Settings
          </button>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className={`${error.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'} border p-4 rounded-2xl mb-8 flex items-center justify-between animate-in slide-in-from-top-4 shadow-xl`}>
            <div className="flex items-center gap-4">
              <i className={`fas ${error.type === 'warning' ? 'fa-hourglass-half' : 'fa-circle-exclamation'} text-lg`}></i>
              <p className="text-xs font-bold uppercase tracking-tight">{error.message}</p>
            </div>
            <button onClick={() => setError(null)} className="opacity-50 hover:opacity-100 p-2">
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}

        <Dashboard summary={portfolioSummary} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <StockForm onAdd={addHolding} isLoading={isLoading} />
            <PortfolioAnalysis onAnalyze={runAnalysis} analysis={analysisResult} isLoading={isAnalyzing} hasData={holdings.length > 0} />
            
            <div className="bg-slate-900/40 p-6 rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Holdings</h3>
                <span className="text-[9px] font-black bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/20">
                  {holdings.length} Assets
                </span>
              </div>
              <div className="space-y-3 max-h-[440px] overflow-y-auto custom-scrollbar pr-1">
                {holdings.map(h => (
                  <div key={h.id} className="bg-slate-800/40 p-4 rounded-2xl border border-white/5 flex items-center justify-between group hover:border-indigo-500/30 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center font-black text-indigo-400 text-xs border border-white/5">
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
              </div>
            </div>
          </div>
          
          <div className="lg:col-span-2 space-y-6">
            <ProjectionChart data={projectionData} />
            <div className="bg-slate-900/20 p-6 rounded-[2.5rem] border border-white/5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Market Research Citations</h4>
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
                    <i className="fas fa-link text-[8px] opacity-40"></i>
                    <span className="max-w-[160px] truncate font-bold uppercase tracking-tight">{s.title}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl max-w-md w-full p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 to-emerald-500"></div>
            
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-white flex items-center gap-3">
                <i className="fas fa-key text-indigo-500"></i>
                API Settings
              </h2>
              {apiKey && (
                <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-white transition">
                  <i className="fas fa-times text-xl"></i>
                </button>
              )}
            </div>

            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              Enter your Google Gemini API key. It is stored locally in your browser.
            </p>

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Gemini API Key</label>
                <input 
                  type="password" 
                  value={tempKey}
                  onChange={(e) => setTempKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-700"
                />
              </div>
              
              <div className="text-[10px] text-slate-500 font-bold px-1">
                Don't have a key? <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Get one for free at Google AI Studio</a>.
              </div>

              <div className="flex gap-3 pt-4">
                {apiKey && (
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="flex-1 px-4 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
                  >
                    Cancel
                  </button>
                )}
                <button 
                  onClick={handleSaveKey}
                  disabled={!tempKey.trim()}
                  className="flex-1 px-4 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-indigo-600/20"
                >
                  Save Connection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

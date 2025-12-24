
export interface StockHolding {
  id: string;
  ticker: string;
  quantity: number;
  purchaseDate: string;
  purchasePrice?: number;
}

export interface DividendData {
  ticker: string;
  name: string;
  currentPrice: number;
  yield: number; // as percentage, e.g., 4.5
  annualDividend: number;
  growthRate: number; // 5yr avg, e.g., 7.0
  payoutFrequency: 'Monthly' | 'Quarterly' | 'Annually';
  lastUpdated: string;
  sources: { title: string; uri: string }[];
}

export interface ProjectionPoint {
  year: number;
  balance: number; // Base case
  bearBalance: number;
  bullBalance: number;
  annualIncome: number;
  cumulativeDividends: number;
  yoc: number; // Yield on Cost percentage
  shares: number; // Total shares owned
}

export interface PortfolioSummary {
  totalValue: number;
  annualIncome: number;
  averageYield: number;
  yieldOnCost: number;
  totalShares: number;
}

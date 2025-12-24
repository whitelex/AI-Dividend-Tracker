
import React, { useState } from 'react';

interface StockFormProps {
  onAdd: (ticker: string, quantity: number, date: string) => void;
  isLoading: boolean;
}

const StockForm: React.FC<StockFormProps> = ({ onAdd, isLoading }) => {
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ticker && quantity && date) {
      onAdd(ticker.toUpperCase(), parseFloat(quantity), date);
      setTicker('');
      setQuantity('');
    }
  };

  return (
    <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700">
      <h3 className="text-xl font-bold mb-4 text-indigo-400">Add New Holding</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Ticker Symbol</label>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="e.g. AAPL, SCHD"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            required
            disabled={isLoading}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Quantity</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0.00"
              step="any"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              required
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Purchase Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              required
              disabled={isLoading}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg transition duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <><i className="fas fa-circle-notch animate-spin"></i> Fetching Data...</>
          ) : (
            <><i className="fas fa-plus"></i> Add to Portfolio</>
          )}
        </button>
      </form>
    </div>
  );
};

export default StockForm;

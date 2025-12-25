
import { GoogleGenAI, Type } from "@google/genai";
import { DividendData, StockHolding } from "../types";

// Helper for exponential backoff retries
const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const isRateLimit = error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED");
    if (isRateLimit && retries > 0) {
      console.warn(`Rate limit hit. Retrying in ${delay}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

export const fetchStockDividendData = async (ticker: string, apiKey: string): Promise<DividendData | null> => {
  if (!apiKey) throw new Error("API Key is missing. Please check your settings.");
  
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
      Find current dividend information for the stock ticker: ${ticker}.
      I need:
      1. Full company name.
      2. Current stock price.
      3. Dividend yield (percentage).
      4. Annual dividend amount per share.
      5. 5-year average dividend growth rate (percentage).
      6. Payout frequency (Monthly, Quarterly, or Annually).
      
      Return the data strictly in JSON format.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            currentPrice: { type: Type.NUMBER },
            yield: { type: Type.NUMBER },
            annualDividend: { type: Type.NUMBER },
            growthRate: { type: Type.NUMBER },
            payoutFrequency: { type: Type.STRING },
          },
          required: ["name", "currentPrice", "yield", "annualDividend", "growthRate", "payoutFrequency"]
        }
      },
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");

    let jsonStr = text.trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const data = JSON.parse(jsonStr);
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map((chunk: any) => ({
        title: chunk.web?.title || "Source",
        uri: chunk.web?.uri || ""
      }))
      .filter((s: any) => s.uri !== "") || [];

    return {
      ticker: ticker.toUpperCase(),
      ...data,
      lastUpdated: new Date().toISOString(),
      sources
    };
  });
};

export const analyzePortfolio = async (holdings: StockHolding[], stockInfo: Record<string, DividendData>, apiKey: string): Promise<string | null> => {
  if (!apiKey) throw new Error("API Key is missing. Please check your settings.");

  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey });
    
    const portfolioSummary = holdings.map(h => {
      const info = stockInfo[h.ticker];
      return info ? `- ${h.ticker} (${info.name}): Qty ${h.quantity}, Yield ${info.yield}%, Growth ${info.growthRate}%, Annual Income $${(h.quantity * info.annualDividend).toFixed(2)}` : `- ${h.ticker}: Data missing`;
    }).join('\n');

    const prompt = `
      Act as a world-class dividend growth investor. Analyze the following portfolio:
      
      ${portfolioSummary}
      
      Provide a concise but deep analysis covering:
      1. Sector Diversification: Based on these tickers, what sectors am I heavy/light on?
      2. Income Quality: Are there any potential "yield traps" or high-risk payout ratios?
      3. Growth Potential: How does the dividend growth rate look for the long term?
      4. Strategic Recommendation: What 1-2 types of assets should I consider adding to balance this?
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });

    return response.text || "Could not generate analysis.";
  });
};

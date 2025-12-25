
import { GoogleGenAI } from "@google/genai";
import { DividendData, StockHolding } from "../types";

// Helper for exponential backoff retries with longer initial delay for 5 RPM limits
const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 3500): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message || "";
    const isRateLimit = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED");
    
    if (isRateLimit && retries > 0) {
      console.warn(`Rate limit encountered. Waiting ${delay}ms to retry... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

export const fetchStockDividendData = async (ticker: string, apiKey: string): Promise<DividendData | null> => {
  if (!apiKey) throw new Error("API Key is missing.");
  
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey });
    // Use gemini-2.5-flash for stable search grounding as seen in reference app
    const model = "gemini-2.5-flash";
    
    const prompt = `
      Perform a deep search for current dividend information for: ${ticker}.
      
      Return exactly these fields in a valid JSON block:
      - name: Full company name
      - currentPrice: Number (latest price)
      - yield: Number (dividend yield percentage)
      - annualDividend: Number (annual payout amount)
      - growthRate: Number (5-year average dividend growth rate percentage)
      - payoutFrequency: String (Monthly, Quarterly, or Annually)
      
      Format the response as:
      \`\`\`json
      { ... your data ... }
      \`\`\`
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        // Manual parsing is required when using googleSearch tool for best stability
      },
    });

    const text = response.text || "";
    
    // Extract JSON from markdown code blocks (same logic as reference app)
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```([\s\S]*?)```/);
    let data;

    if (jsonMatch && jsonMatch[1]) {
      data = JSON.parse(jsonMatch[1]);
    } else {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        data = JSON.parse(text.substring(start, end + 1));
      } else {
        throw new Error("Invalid format received from AI.");
      }
    }

    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map((chunk: any) => ({
        title: chunk.web?.title || "Market Source",
        uri: chunk.web?.uri || ""
      }))
      .filter((s: any) => s.uri !== "") || [];

    // Deduplicate sources
    const uniqueSources = Array.from(new Map(sources.map((item: any) => [item.uri, item])).values());

    return {
      ticker: ticker.toUpperCase(),
      name: data.name,
      currentPrice: data.currentPrice,
      yield: data.yield,
      annualDividend: data.annualDividend,
      growthRate: data.growthRate,
      payoutFrequency: data.payoutFrequency,
      lastUpdated: new Date().toISOString(),
      sources: uniqueSources as any
    };
  });
};

export const analyzePortfolio = async (holdings: StockHolding[], stockInfo: Record<string, DividendData>, apiKey: string): Promise<string | null> => {
  if (!apiKey) throw new Error("API Key is missing.");

  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey });
    
    const portfolioSummary = holdings.map(h => {
      const info = stockInfo[h.ticker];
      return info ? `- ${h.ticker} (${info.name}): Qty ${h.quantity}, Yield ${info.yield}%, Growth ${info.growthRate}%` : `- ${h.ticker}: Data missing`;
    }).join('\n');

    const prompt = `
      Analyze this dividend portfolio:
      ${portfolioSummary}
      
      Evaluate diversification, risk of "yield traps", and projected 10-year income growth potential. Give 2 actionable suggestions.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 2000 }
      }
    });

    return response.text || "Analysis unavailable.";
  });
};

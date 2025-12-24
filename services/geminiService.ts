
import { GoogleGenAI, Type } from "@google/genai";
import { DividendData } from "../types";

// Function to fetch dividend data using Gemini with Google Search grounding.
export const fetchStockDividendData = async (ticker: string): Promise<DividendData | null> => {
  try {
    // Instantiate GoogleGenAI right before the API call to ensure it uses the latest API key from the environment.
    // GUIDELINE: Must use a named parameter and obtain the key exclusively from process.env.API_KEY.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
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

    // GUIDELINE: Access .text property directly, do not call as a method.
    const text = response.text;
    if (!text) {
      throw new Error("Empty response from AI");
    }

    const data = JSON.parse(text.trim());
    
    // GUIDELINE: Extract website URLs from groundingChunks as required when using Google Search.
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
  } catch (error) {
    console.error("Error fetching stock data:", error);
    return null;
  }
};

# DiviTrack Pro - Intelligent Dividend Growth Tracker

DiviTrack Pro is a high-end financial dashboard designed for dividend growth investors. It combines real-time data grounded in Google Search via Gemini 3 with advanced compounding algorithms to visualize long-term wealth creation.

## 🚀 Features

- **AI-Powered Search Grounding**: Automatically fetches real-time stock data (yield, growth rates, frequencies) using the Gemini API.
- **Compounded Growth Engine**: Simulates Dividend Reinvestment (DRIP) to project future portfolio value and share accumulation.
- **Scenario Modeling**: Visualizes potential outcomes with Bull, Base, and Bear market capital appreciation cases.
- **Yield on Cost (YOC) Tracking**: Monitor how your effective yield increases over time relative to your initial capital.
- **Interactive Analytics**: Detailed charts powered by Recharts with dual-axis visualization.
- **Local Persistence**: Securely saves your portfolio data to browser storage.

## 🛠️ Technology Stack

- **Frontend**: React (ESModules)
- **Styling**: Tailwind CSS
- **Visualization**: Recharts
- **AI Engine**: Google Gemini 3 (Flash Preview)
- **Icons**: Font Awesome 6

## 🚦 Getting Started

### API Key Selection
This application requires an API key with access to the Gemini 2.5/3 models and Google Search tools.
- Click the **"Connect API Key"** button in the top navigation bar.
- Select an API key from a project with billing enabled (required for Search Grounding).
- The key is securely managed via the platform's `process.env.API_KEY` bridge.

### Managing Portfolio
1. Enter a valid stock ticker (e.g., `AAPL`, `SCHD`, `O`).
2. Input the quantity of shares and your purchase date.
3. The AI will fetch the latest metadata and update your projections instantly.

## ⚖️ Disclaimer
*DiviTrack Pro is a simulation tool. Financial projections are estimates and do not guarantee future performance. Always perform your own due diligence before making investment decisions.*

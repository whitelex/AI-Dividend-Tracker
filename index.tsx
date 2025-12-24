
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const mountApp = () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error("Could not find root element to mount to");
    return;
  }

  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Critical error during React initialization:", error);
    rootElement.innerHTML = `
      <div style="padding: 24px; color: #fecaca; background: #450a0a; border: 1px solid #7f1d1d; border-radius: 12px; margin: 40px; font-family: sans-serif; max-width: 600px; margin-left: auto; margin-right: auto; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);">
        <h1 style="font-size: 20px; margin: 0 0 12px 0; font-weight: bold;">Application Error</h1>
        <p style="font-size: 14px; margin: 0; line-height: 1.5; opacity: 0.9;">Failed to load DiviTrack Pro. This usually happens if there is an issue with the module resolution or environment configuration. Please check the browser console for specific error details.</p>
        <button onclick="window.location.reload()" style="margin-top: 20px; background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold;">Reload Application</button>
      </div>
    `;
  }
};

// Check if document is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountApp);
} else {
  mountApp();
}

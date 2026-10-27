import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Remove StrictMode — it double-invokes effects in development
// causing duplicate setInterval calls and duplicate API fetches.
// StrictMode is a dev-only tool; removing it here doesn't affect
// production behaviour.
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

// Service worker registration
// Only register in production (not localhost)
if (
  process.env.NODE_ENV === 'production' &&
  'serviceWorker' in navigator
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.warn('SW registration failed:', err));
  });
} else if ('serviceWorker' in navigator) {
  // Development: unregister any previously registered SW
  // so it never interferes with localhost API or tile requests
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => {
      reg.unregister().then(() =>
        console.log('Dev: SW unregistered to prevent fetch interception')
      );
    });
  });
}
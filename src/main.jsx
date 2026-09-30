import { LanguageProvider } from './context/LanguageContext';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

if (typeof window !== 'undefined') {
  try {
    let currentFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : window.fetch;
    const descriptor = {
      configurable: true,
      enumerable: true,
      get() {
        return currentFetch;
      },
      set(fn) {
        if (typeof fn === 'function') {
          currentFetch = fn;
        }
      },
    };
    Object.defineProperty(window, 'fetch', descriptor);
    if (typeof Window !== 'undefined' && Window.prototype) {
      Object.defineProperty(Window.prototype, 'fetch', descriptor);
    }
  } catch {
    // Ignore if window.fetch descriptor cannot be modified
  }
}

createRoot(document.getElementById('root')).render(
  <LanguageProvider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </LanguageProvider>
);

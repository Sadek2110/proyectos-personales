import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { MotionConfig } from 'motion/react';
import './estilos.css';
import { persistencia, qc } from './api.js';
import App from './App.jsx';
import { UIProvider } from './ui.jsx';

createRoot(document.getElementById('raiz')).render(
  <StrictMode>
    <PersistQueryClientProvider client={qc} persistOptions={persistencia}>
      <MotionConfig reducedMotion="user">
        <UIProvider><App /></UIProvider>
      </MotionConfig>
    </PersistQueryClientProvider>
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

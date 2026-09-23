import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@renderer/App';
import { Toaster } from '@renderer/components/ui/sonner';
import { TooltipProvider } from '@renderer/components/ui/tooltip';
import '@renderer/index.css';
import { makeMockApi } from '../mock-api';

// Install the in-memory seam before React mounts (same contract the Electron
// preload / web bootstrap provide). No AuthGate — render the app directly.
window.platform = 'web';
window.api = makeMockApi();

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing');

createRoot(container).render(
  <StrictMode>
    <TooltipProvider delayDuration={300}>
      <App />
      <Toaster />
    </TooltipProvider>
  </StrictMode>,
);

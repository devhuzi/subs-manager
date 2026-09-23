import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@renderer/App';
import { Toaster } from '@renderer/components/ui/sonner';
import { TooltipProvider } from '@renderer/components/ui/tooltip';
import '@renderer/index.css';
import { supabase } from './supabase';
import { makeWebApi } from './api/webApi';
import { AuthGate } from './auth/AuthGate';

// Install the platform seam BEFORE React mounts, so the renderer's
// useAppData mount-effect (which calls window.api.loadData synchronously)
// always finds an implementation. Same contract the Electron preload provides.
window.platform = 'web';
window.api = makeWebApi(supabase);

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing');

createRoot(container).render(
  <StrictMode>
    <TooltipProvider delayDuration={300}>
      <AuthGate>
        <App />
      </AuthGate>
      <Toaster />
    </TooltipProvider>
  </StrictMode>,
);

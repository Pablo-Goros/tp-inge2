import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './styles/global.css';
import './styles/app.css';
import { createAppRouter } from './app/router';
import { AppErrorBoundary } from './features/errors/UnexpectedErrorPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <RouterProvider router={createAppRouter()} />
    </AppErrorBoundary>
  </StrictMode>,
);

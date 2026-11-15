import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/global.css';
import { ComponentsGallery } from './dev/ComponentsGallery';

// TODO(etapa 2): reemplazar por el router real con guards.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ComponentsGallery />
    </BrowserRouter>
  </StrictMode>,
);

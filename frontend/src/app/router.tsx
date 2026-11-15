import { lazy, Suspense } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { routes } from './routes';

// La galería de componentes solo existe en dev: /dev/components.
const Gallery = lazy(() => import('../dev/ComponentsGallery').then((m) => ({ default: m.ComponentsGallery })));
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: '/dev/components', element: <Suspense fallback={null}><Gallery /></Suspense> }]
  : [];

export const createAppRouter = () => createBrowserRouter([...devRoutes, ...routes]);

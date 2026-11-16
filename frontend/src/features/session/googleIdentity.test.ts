import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tags = () => document.head.querySelectorAll('script[src*="gsi/client"]');

describe('loadGis (real)', () => {
  let loadGis: () => Promise<unknown>;
  beforeEach(async () => {
    vi.resetModules();
    delete window.google;
    document.head.innerHTML = '';
    ({ loadGis } = await import('./googleIdentity'));
  });
  afterEach(() => { delete window.google; });

  it('inyecta el script una sola vez en dos llamadas', () => {
    void loadGis(); void loadGis();
    expect(tags()).toHaveLength(1);
  });

  it('rechaza y quita el script en error', async () => {
    const p = loadGis();
    tags()[0].dispatchEvent(new Event('error'));
    await expect(p).rejects.toThrow();
    expect(tags()).toHaveLength(0);
  });

  it('rechaza y quita el script si carga sin window.google.accounts', async () => {
    const p = loadGis();
    tags()[0].dispatchEvent(new Event('load'));
    await expect(p).rejects.toThrow();
    expect(tags()).toHaveLength(0);
  });

  it('resuelve al cargar con window.google.accounts presente', async () => {
    const p = loadGis();
    const g = { accounts: { id: {} } };
    (window as unknown as { google: unknown }).google = g;
    tags()[0].dispatchEvent(new Event('load'));
    await expect(p).resolves.toBe(g);
  });
});

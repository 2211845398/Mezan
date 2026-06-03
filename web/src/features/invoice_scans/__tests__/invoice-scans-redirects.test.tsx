import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { renderWithProviders, screen } from '@/test/utils';

import InventoryScansDetailRedirect from '../pages/InventoryScansDetailRedirect';
import InventoryScansIndexRedirect from '../pages/InventoryScansIndexRedirect';

describe('invoice scan legacy routes', () => {
  it('redirects /inventory/scans index to purchasing queue', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(
      <Routes>
        <Route path="/inventory/scans" element={<InventoryScansIndexRedirect />} />
        <Route path="/purchasing/invoice-match" element={<div>purchasing-queue</div>} />
      </Routes>,
      { initialEntries: ['/inventory/scans'] },
    );
    expect(await screen.findByText('purchasing-queue')).toBeInTheDocument();
  });

  it('redirects /inventory/scans/:id to purchasing detail', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(
      <Routes>
        <Route path="/inventory/scans/:id" element={<InventoryScansDetailRedirect />} />
        <Route path="/purchasing/invoice-match/:id" element={<div>detail-mock</div>} />
      </Routes>,
      { initialEntries: ['/inventory/scans/42'] },
    );
    expect(await screen.findByText('detail-mock')).toBeInTheDocument();
  });
});

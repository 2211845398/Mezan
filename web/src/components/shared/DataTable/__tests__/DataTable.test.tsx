import { useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/utils';

// Tiny probe so tests can read router-driven URL state without depending on
// jsdom's real `window.location` (MemoryRouter doesn't touch it).
function UrlProbe() {
  const [sp] = useSearchParams();
  return <div data-testid="url-state">{sp.toString()}</div>;
}

type Invoice = { id: number; supplier: string; amount: number };

const columns = defineColumns<Invoice>()([
  {
    id: 'id',
    accessorKey: 'id',
    header: 'ID',
    cell: ({ getValue }) => String(getValue()),
  },
  {
    id: 'supplier',
    accessorKey: 'supplier',
    header: 'Supplier',
    cell: ({ getValue }) => String(getValue()),
  },
  {
    id: 'amount',
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ getValue }) => String(getValue()),
  },
]);

const rows: Invoice[] = [
  { id: 1, supplier: 'Alpha', amount: 100 },
  { id: 2, supplier: 'Beta', amount: 200 },
  { id: 3, supplier: 'Gamma', amount: 300 },
];

describe('DataTable (W-3.3)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the three rows and their cells', () => {
    renderWithProviders(
      <DataTable columns={columns} data={rows} totalRows={rows.length} mode="server" />,
      { initialEntries: ['/list'] },
    );

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('updates the URL page= query param when the user clicks Next', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <DataTable columns={columns} data={rows} totalRows={200} mode="server" />
        <UrlProbe />
      </>,
      { initialEntries: ['/list'] },
    );

    await user.click(screen.getByRole('button', { name: /next page|الصفحة التالية/i }));

    await waitFor(() => {
      expect(screen.getByTestId('url-state').textContent).toMatch(/page=2/);
    });
  });

  it('hides a column when toggled off in the visibility menu', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataTable
        columns={columns}
        data={rows}
        totalRows={rows.length}
        mode="server"
        initialVisibility={{ supplier: false }}
      />,
      { initialEntries: ['/list'] },
    );

    // The supplier column was asked to start hidden; no Alpha/Beta text
    // should reach the rendered table body. This covers the wiring from
    // `initialVisibility` → persisted state → TanStack Table's `state`.
    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.queryByText('Beta')).toBeNull();
    expect(screen.queryByText('Gamma')).toBeNull();

    // Toggling via the menu makes the column visible again. The menu item
    // is a full-width <button>; clicking anywhere on it flips the hidden
    // state via `column.toggleVisibility`.
    const columnsButton = screen.getByRole('button', { name: /columns|الأعمدة/i });
    columnsButton.focus();
    await user.keyboard('{Enter}');
    const supplierToggle = await screen.findByRole('menuitem', { name: /supplier/i });
    await user.click(supplierToggle);

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
  });

  it('switches density and persists the choice to localStorage', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataTable columns={columns} data={rows} totalRows={rows.length} mode="server" />,
      { initialEntries: ['/list-density'] },
    );

    await user.click(screen.getByRole('button', { name: /density|الكثافة|عادية|normal/i }));
    await user.click(await screen.findByRole('menuitem', { name: /compact|مضغوطة/i }));

    await waitFor(() => {
      const raw = window.localStorage.getItem('mezan.table./list-density');
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw as string);
      expect(parsed.density).toBe('compact');
    });
  });
});

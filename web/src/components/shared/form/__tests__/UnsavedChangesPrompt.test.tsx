import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { UnsavedChangesPrompt } from '@/components/shared/form/UnsavedChangesPrompt';
import i18n from '@/i18n';

function EditPage() {
  return (
    <div>
      <UnsavedChangesPrompt when={true} />
      <Link to="/other">leave</Link>
    </div>
  );
}

function OtherPage() {
  return <div>other-page</div>;
}

function renderRouter() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <EditPage /> },
      { path: '/other', element: <OtherPage /> },
    ],
    { initialEntries: ['/'] },
  );
  return render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

describe('UnsavedChangesPrompt', () => {
  it('blocks navigation and shows the confirmation dialog when dirty', async () => {
    const user = userEvent.setup();
    renderRouter();

    await user.click(screen.getByRole('link', { name: 'leave' }));

    // The alert dialog should now be showing its title.
    expect(
      await screen.findByRole('alertdialog'),
    ).toBeInTheDocument();
    // Still on the edit page; navigation was blocked.
    expect(screen.queryByText('other-page')).toBeNull();
  });
});

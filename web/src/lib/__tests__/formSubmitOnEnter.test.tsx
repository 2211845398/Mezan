import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  handleContainerEnterSubmit,
  handleFormEnterSubmit,
} from '@/lib/formSubmitOnEnter';

describe('formSubmitOnEnter', () => {
  it('handleFormEnterSubmit submits when form is inside a dialog', () => {
    const onSubmit = vi.fn((e: SubmitEvent) => e.preventDefault());
    render(
      <div role="dialog">
        <form onSubmit={onSubmit} onKeyDown={handleFormEnterSubmit}>
          <input aria-label="name" />
        </form>
      </div>,
    );

    const input = screen.getByLabelText('name');
    fireEvent.keyDown(input, { key: 'Enter', bubbles: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('handleFormEnterSubmit ignores Enter in textarea', () => {
    const onSubmit = vi.fn((e: SubmitEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit} onKeyDown={handleFormEnterSubmit}>
        <textarea aria-label="notes" />
      </form>,
    );

    fireEvent.keyDown(screen.getByLabelText('notes'), { key: 'Enter', bubbles: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('handleContainerEnterSubmit finds nested form and submits', () => {
    const onSubmit = vi.fn((e: SubmitEvent) => e.preventDefault());
    render(
      <div role="dialog" onKeyDown={handleContainerEnterSubmit}>
        <form onSubmit={onSubmit}>
          <input aria-label="field" />
        </form>
      </div>,
    );

    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'Enter', bubbles: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ModalDialog } from './ModalDialog';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <ModalDialog title="Example" onClose={() => setOpen(false)}>
          <input aria-label="Inside" />
        </ModalDialog>
      )}
    </>
  );
}

describe('ModalDialog', () => {
  // jsdom has no showModal(); stand in for the browser's, which opens and focuses the dialog.
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
      this.querySelector<HTMLElement>('input')?.focus();
    };
  });
  afterEach(() => {
    delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  });

  it('returns focus to the opener on close under StrictMode', async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    expect(screen.getByRole('textbox', { name: 'Inside' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('textbox', { name: 'Inside' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

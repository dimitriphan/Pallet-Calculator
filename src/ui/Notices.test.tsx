import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useNoticesStore } from '../store/noticesStore';
import { Notices } from './Notices';

afterEach(() => useNoticesStore.setState({ notices: [] }));

describe('Notices', () => {
  it('keeps one empty live region mounted, and notices appear inside it', () => {
    render(<Notices />);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();

    act(() => useNoticesStore.getState().push('Build sheet could not be created. Try again.'));
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Build sheet could not be created. Try again.');
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedChoice } from './SegmentedChoice';

const OPTIONS = ['a', 'b', 'c'] as const;
type Option = (typeof OPTIONS)[number];
const LABELS: Record<Option, string> = { a: 'First', b: 'Second', c: 'Third' };
const HINTS: Record<Option, string> = { a: 'Hint one', b: 'Hint two', c: 'Hint three' };

function setup(value: Option) {
  const onChange = vi.fn();
  render(
    <SegmentedChoice
      label="Choice"
      options={OPTIONS}
      labels={LABELS}
      hints={HINTS}
      value={value}
      onChange={onChange}
    />,
  );
  const radio = (name: string) => screen.getByRole('radio', { name });
  return { onChange, radio };
}

afterEach(cleanup);

describe('SegmentedChoice', () => {
  it('is a radio group with only the chosen option in the tab order', () => {
    const { radio } = setup('b');
    expect(screen.getByRole('radiogroup', { name: 'Choice' })).toBeInTheDocument();
    expect(radio('Second')).toBeChecked();
    expect(radio('Second')).toHaveAttribute('tabindex', '0');
    expect(radio('First')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('Hint two')).toBeInTheDocument();
  });

  it('clicking another option chooses it', () => {
    const { onChange, radio } = setup('b');
    fireEvent.click(radio('Third'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('clicking the option already chosen does not call onChange', () => {
    const { onChange, radio } = setup('b');
    fireEvent.click(radio('Second'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('arrow keys move the choice and wrap round', () => {
    const { onChange, radio } = setup('c');
    fireEvent.keyDown(radio('Third'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('a');
    expect(radio('First')).toHaveFocus();
    fireEvent.keyDown(radio('Third'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('b');
  });

  it('Home chooses the first option and End the last', () => {
    const { onChange, radio } = setup('b');
    fireEvent.keyDown(radio('Second'), { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('a');
    expect(radio('First')).toHaveFocus();
    fireEvent.keyDown(radio('Second'), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('c');
    expect(radio('Third')).toHaveFocus();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('Home on the first option changes nothing', () => {
    const { onChange, radio } = setup('a');
    fireEvent.keyDown(radio('First'), { key: 'Home' });
    expect(onChange).not.toHaveBeenCalled();
  });
});

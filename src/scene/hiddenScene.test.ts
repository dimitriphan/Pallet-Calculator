import { describe, expect, it } from 'vitest';
import { hiddenSceneProps } from './hiddenScene';

describe('the view of the selected layout under the editor', () => {
  it('is invisible and hidden from assistive technology while the editor is open', () => {
    expect(hiddenSceneProps(true)).toEqual({ className: 'invisible', 'aria-hidden': 'true' });
  });
  it('is neither once the editor has closed', () => {
    expect(hiddenSceneProps(false)).toEqual({ className: '' });
    expect(hiddenSceneProps(false)).not.toHaveProperty('aria-hidden');
  });
});

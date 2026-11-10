import { beforeEach, describe, expect, it } from 'vitest';
import { useNoticesStore, type Notice } from './noticesStore';

describe('useNoticesStore', () => {
  beforeEach(() => useNoticesStore.setState({ notices: [] }));

  it('pushes notices with unique ids and dismisses by id', () => {
    useNoticesStore.getState().push('one');
    useNoticesStore.getState().push('two');
    const [a, b] = useNoticesStore.getState().notices as [Notice, Notice];
    expect(a.message).toBe('one');
    expect(a.id).not.toBe(b.id);
    useNoticesStore.getState().dismiss(a.id);
    expect(useNoticesStore.getState().notices.map((n) => n.message)).toEqual(['two']);
  });
});

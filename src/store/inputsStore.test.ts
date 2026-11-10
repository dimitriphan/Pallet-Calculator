import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import { draftFromInputs } from '../domain/schemas';
import type { Inputs } from '../domain/types';
import { STORAGE_KEYS } from '../persistence/keys';
import { FakeStorage } from '../persistence/testStorage';
import { createInputsStore, useInputsStore } from './inputsStore';

describe('inputsStore', () => {
  it('starts from the defaults and parses them', () => {
    const s = createInputsStore(new FakeStorage()).getState();
    expect(s.draft).toEqual(draftFromInputs(DEFAULT_INPUTS));
    expect(s.parsed).toEqual({ ok: true, inputs: DEFAULT_INPUTS });
  });

  it('reports an error for a pallet height of 4 and keeps the typed text', () => {
    const store = createInputsStore(new FakeStorage());
    store.getState().setField('pallet.height', '4');
    const s = store.getState();
    expect(s.draft.pallet.height).toBe('4');
    expect(s.parsed.ok).toBe(false);
    if (!s.parsed.ok) expect(s.parsed.errors['pallet.height']).toBeTruthy();
  });

  it('sets top-level and nested fields and ignores unknown paths', () => {
    const store = createInputsStore(new FakeStorage());
    store.getState().setField('leeway', '1');
    store.getState().setField('targetQuantity', '10');
    store.getState().setField('maxCarton.width', '20');
    const before = store.getState().draft;
    store.getState().setField('bogus.path', '9');
    store.getState().setField('rotationMode', 'x');
    expect(store.getState().draft).toEqual(before);
    expect(before.leeway).toBe('1');
    expect(before.targetQuantity).toBe('10');
    expect(before.maxCarton.width).toBe('20');
  });

  it('sets rotation mode, toggles orientations and the upright flag', () => {
    const store = createInputsStore(new FakeStorage());
    store.getState().setRotationMode('custom');
    store.getState().toggleOrientation('LWH');
    store.getState().toggleOrientation('HWL');
    store.getState().toggleOrientation('LWH');
    store.getState().setKeepCartonsUpright(true);
    const d = store.getState().draft;
    expect(d.rotationMode).toBe('custom');
    expect(d.customOrientations).toEqual(['HWL']);
    expect(d.keepCartonsUpright).toBe(true);
  });

  it('replaceInputs round-trips through draftFromInputs and reset restores defaults', () => {
    const store = createInputsStore(new FakeStorage());
    const next: Inputs = { ...DEFAULT_INPUTS, targetQuantity: 99, leeway: 2 };
    store.getState().replaceInputs(next);
    expect(store.getState().draft).toEqual(draftFromInputs(next));
    expect(store.getState().parsed).toEqual({ ok: true, inputs: next });
    store.getState().reset();
    expect(store.getState().draft).toEqual(draftFromInputs(DEFAULT_INPUTS));
  });

  it('persists the draft and restores it in a new instance', () => {
    const storage = new FakeStorage();
    createInputsStore(storage).getState().setField('pallet.length', '60');
    expect(storage.getItem(STORAGE_KEYS.inputs)).toContain('60');
    expect(createInputsStore(storage).getState().draft.pallet.length).toBe('60');
  });

  it('falls back to defaults for malformed or wrongly shaped stored drafts', () => {
    for (const bad of [
      'not json',
      '{"pallet":1}',
      JSON.stringify({ ...draftFromInputs(DEFAULT_INPUTS), leeway: 5 }),
    ]) {
      const storage = new FakeStorage();
      storage.setItem(STORAGE_KEYS.inputs, bad);
      expect(createInputsStore(storage).getState().draft).toEqual(draftFromInputs(DEFAULT_INPUTS));
    }
  });

  it('swallows storage failures', () => {
    const storage = new FakeStorage();
    storage.failReads = true;
    storage.failWrites = true;
    const store = createInputsStore(storage);
    expect(() => store.getState().setField('leeway', '3')).not.toThrow();
    expect(store.getState().draft.leeway).toBe('3');
  });

  it('exports a default hook that exists', () => {
    expect(useInputsStore.getState().draft).toBeDefined();
  });
});

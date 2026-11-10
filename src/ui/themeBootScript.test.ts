import { describe, expect, it } from 'vitest';
import html from '../../index.html?raw';
import { STORAGE_KEYS } from '../persistence/keys';
import { FakeStorage } from '../persistence/testStorage';
import { createPrefsStore } from '../store/prefsStore';

const head = html.slice(0, html.indexOf('</head>'));
const body = /<script>([\s\S]*?)<\/script>/.exec(head)?.[1] ?? '';

type Stored = string | null | 'throw';

/** Runs the real inline script against fakes and reports whether it added "harbor". */
function bootAddsHarbor(stored: Stored): boolean {
  const added: string[] = [];
  const localStorage = {
    getItem: () => {
      if (stored === 'throw') throw new Error('blocked');
      return stored;
    },
  };
  const document = { documentElement: { classList: { add: (c: string) => added.push(c) } } };
  new Function('localStorage', 'document', body)(localStorage, document);
  expect(added.filter((c) => c !== 'harbor')).toEqual([]);
  return added.includes('harbor');
}

/** What the app itself resolves for the same stored string. */
function appResolvesHarbor(stored: Stored): boolean {
  const storage = new FakeStorage();
  if (typeof stored === 'string') storage.setItem(STORAGE_KEYS.prefs, stored);
  if (stored === 'throw') storage.failReads = true;
  return createPrefsStore(storage).getState().theme === 'harbor';
}

const CASES: [string, Stored, boolean][] = [
  ['no stored value', null, true],
  ['light stored', '{"theme":"light"}', false],
  ['harbor stored', '{"theme":"harbor"}', true],
  ['dark stored', '{"theme":"dark"}', true],
  ['system stored', '{"theme":"system"}', true],
  ['theme missing', '{"viewMode":"full"}', true],
  ['theme invalid', '{"theme":"x"}', true],
  ['"Light" in another case', '{"theme":"Light"}', true],
  ['unparseable JSON', '{bad', true],
  ['getItem throws', 'throw', true],
];

describe('theme boot script in index.html', () => {
  it('is found in the head', () => {
    expect(body).toContain('pc.prefs.v1');
  });

  it('does not consult the operating system', () => {
    expect(body).not.toContain('matchMedia');
  });

  it.each(CASES)('%s', (_name, stored, expected) => {
    expect(bootAddsHarbor(stored)).toBe(expected);
    expect(bootAddsHarbor(stored)).toBe(appResolvesHarbor(stored));
  });
});

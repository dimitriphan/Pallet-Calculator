import { describe, expect, it } from 'vitest';
import html from '../../index.html?raw';
import { STORAGE_KEYS } from '../persistence/keys';
import { FakeStorage } from '../persistence/testStorage';
import { createPrefsStore, resolveTheme } from '../store/prefsStore';

const head = html.slice(0, html.indexOf('</head>'));
const body = /<script>([\s\S]*?)<\/script>/.exec(head)?.[1] ?? '';

interface Env {
  stored: string | null | 'throw';
  systemDark: boolean | 'missing' | 'throw';
}

/** Runs the real inline script against fakes and reports whether it added "dark". */
function bootAddsDark({ stored, systemDark }: Env): boolean {
  const added: string[] = [];
  const localStorage = {
    getItem: () => {
      if (stored === 'throw') throw new Error('blocked');
      return stored;
    },
  };
  const matchMedia =
    systemDark === 'missing'
      ? undefined
      : () => {
          if (systemDark === 'throw') throw new Error('no media');
          return { matches: systemDark };
        };
  const document = { documentElement: { classList: { add: (c: string) => added.push(c) } } };
  new Function('localStorage', 'matchMedia', 'document', body)(localStorage, matchMedia, document);
  return added.includes('dark');
}

/** What the app itself resolves for the same stored string and system setting. */
function appResolvesDark({ stored, systemDark }: Env): boolean {
  const storage = new FakeStorage();
  if (typeof stored === 'string' && stored !== 'throw') storage.setItem(STORAGE_KEYS.prefs, stored);
  if (stored === 'throw') storage.failReads = true;
  const theme = createPrefsStore(storage).getState().theme;
  return resolveTheme(theme, systemDark === true) === 'dark';
}

const CASES: [string, Env, boolean][] = [
  ['no stored value, system dark', { stored: null, systemDark: true }, true],
  ['no stored value, system light', { stored: null, systemDark: false }, false],
  ['dark stored, system light', { stored: '{"theme":"dark"}', systemDark: false }, true],
  ['light stored, system dark', { stored: '{"theme":"light"}', systemDark: true }, false],
  ['theme missing, system dark', { stored: '{"viewMode":"full"}', systemDark: true }, true],
  ['theme invalid, system dark', { stored: '{"theme":"x"}', systemDark: true }, true],
  ['unparseable JSON, system dark', { stored: '{bad', systemDark: true }, true],
  ['getItem throws, system dark', { stored: 'throw', systemDark: true }, true],
  ['no matchMedia, nothing stored', { stored: null, systemDark: 'missing' }, false],
  ['matchMedia throws, nothing stored', { stored: null, systemDark: 'throw' }, false],
];

describe('theme boot script in index.html', () => {
  it('is found in the head', () => {
    expect(body).toContain('pc.prefs.v1');
  });

  it.each(CASES)('%s', (_name, env, expected) => {
    expect(bootAddsDark(env)).toBe(expected);
    expect(bootAddsDark(env)).toBe(appResolvesDark(env));
  });
});

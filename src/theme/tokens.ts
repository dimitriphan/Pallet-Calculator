/** Interface colours of the Harbor theme. Tailwind reads these too, as `harbor-*` colours. */
export const HARBOR = {
  deep: '#1E3347',
  panel: '#2E4A62',
  raised: '#35546D',
  teal: '#3F8F96',
  tealFill: '#34767C',
  tealText: '#A3CACD',
  foam: '#E9F1EE',
  mist: '#B4C8CF',
  coral: '#E2725B',
  coralText: '#F0B5A9',
  sand: '#D8C49A',
  green: '#7BCF80',
  viewport: '#284256',
} as const;

type Token = keyof typeof HARBOR;

const SURFACES: Token[] = ['deep', 'panel', 'raised'];

/** Every text-on-background pairing the Harbor theme allows (spec 4.1). All reach 4.5:1. */
export const HARBOR_TEXT_PAIRS: { text: Token; on: Token }[] = [
  ...(['foam', 'mist', 'tealText', 'coralText', 'sand'] as const).flatMap((text) =>
    SURFACES.map((on) => ({ text, on })),
  ),
  // Green is never text on raised.
  { text: 'green', on: 'deep' },
  { text: 'green', on: 'panel' },
  { text: 'foam', on: 'tealFill' },
  { text: 'deep', on: 'sand' },
  { text: 'deep', on: 'green' },
  { text: 'foam', on: 'viewport' },
  { text: 'mist', on: 'viewport' },
];

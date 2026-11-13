import { BUTTON, PRIMARY_BUTTON } from '../ModalDialog';

/** Editor controls are at least 44 px each way, for fingers (spec 6.2b). */
const TOUCH = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center';

export const EDITOR_BUTTON = `${BUTTON} ${TOUCH}`;
export const EDITOR_PRIMARY = `${PRIMARY_BUTTON} ${TOUCH}`;

/** A broken limit: the error style. Red in Light, coral in Harbor. */
export const ERROR_BOX =
  'border border-red-300 bg-red-50 px-2 py-1.5 text-sm text-red-800 dark:border-harbor-coral dark:border-l-[3px] dark:bg-harbor-panel dark:text-harbor-coral-text';

/** Information that is not a broken limit. */
export const NOTE_BOX =
  'border border-amber-200 bg-amber-50 px-2 py-1.5 text-sm text-amber-900 dark:border-b-0 dark:border-r-0 dark:border-harbor-sand dark:bg-harbor-panel dark:text-harbor-sand';

export const SECTION_TITLE = 'text-xs heading text-gray-500 dark:text-harbor-mist';
export const HINT = 'text-xs text-gray-600 dark:text-harbor-mist';

import { settingsSummary } from './settingsSummary';
import { useInputs, useResults, useStores } from './StoreContext';
import { focusViewModeRadio } from './ViewModeSwitch';

const HIDDEN_INVALID = 'A setting in Full view needs fixing before results can update.';

/** Fields Basic mode shows; an error under any other key is in a field only Full view shows. */
function visibleInBasic(errorKey: string): boolean {
  return (
    errorKey.startsWith('pallet.') ||
    errorKey.startsWith('product.') ||
    errorKey.startsWith('maxCarton.') ||
    errorKey === 'boxesPerCarton'
  );
}

const LINK_BUTTON =
  'text-blue-700 underline underline-offset-2 hover:text-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-400 dark:hover:text-blue-300 dark:focus-visible:outline-blue-400';

/**
 * Basic mode's one line about the settings it does not show: what will be used, or that a
 * setting in Full view is invalid, with a way to Full view.
 */
export function SettingsSummary() {
  const { prefs } = useStores();
  const parsed = useInputs((s) => s.parsed);
  const lastInputs = useResults((s) => s.inputs);
  const openFull = () => {
    // This button unmounts with Basic mode; leave focus on the Full radio it selected.
    focusViewModeRadio('full');
    prefs.getState().setViewMode('full');
  };

  let text: string | null;
  let action: string;
  let tone =
    'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300';
  if (parsed.ok) {
    text = settingsSummary(parsed.inputs);
    action = 'Change in Full view';
  } else if (!Object.keys(parsed.errors).some(visibleInBasic)) {
    text = HIDDEN_INVALID;
    action = 'Open Full view';
    tone =
      'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200';
  } else {
    // A field on this screen is invalid; describe the settings behind the result still shown.
    text = lastInputs ? settingsSummary(lastInputs) : null;
    action = 'Change in Full view';
  }
  if (text === null) return null;

  return (
    <p className={`border px-3 py-2 text-sm ${tone}`}>
      {text}{' '}
      <button type="button" onClick={openFull} className={LINK_BUTTON}>
        {action}
      </button>
    </p>
  );
}

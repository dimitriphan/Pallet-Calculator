import { useUnit } from './useUnit';
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
  'focus-ticks text-blue-700 underline underline-offset-2 hover:text-blue-900 dark:text-harbor-teal-text dark:hover:text-harbor-teal-text';

/**
 * Basic mode's one line about the settings it does not show: what will be used, or that a
 * setting in Full view is invalid, with a way to Full view.
 */
export function SettingsSummary() {
  const { prefs } = useStores();
  const parsed = useInputs((s) => s.parsed);
  const lastInputs = useResults((s) => s.inputs);
  const unit = useUnit();
  const openFull = () => {
    // This button unmounts with Basic mode; leave focus on the Full radio it selected.
    focusViewModeRadio('full');
    prefs.getState().setViewMode('full');
  };

  let text: string | null;
  let action: string;
  let tone = 'bracket bg-gray-50 text-gray-700 dark:bg-harbor-panel dark:text-harbor-foam';
  if (parsed.ok) {
    text = settingsSummary(parsed.inputs, unit);
    action = 'Change in Full view';
  } else if (!Object.keys(parsed.errors).some(visibleInBasic)) {
    text = HIDDEN_INVALID;
    action = 'Open Full view';
    tone =
      'border border-red-200 bg-red-50 text-red-800 dark:border-0 dark:border-l-2 dark:border-harbor-coral dark:bg-harbor-panel dark:text-harbor-coral-text';
  } else {
    // A field on this screen is invalid; describe the settings behind the result still shown.
    text = lastInputs ? settingsSummary(lastInputs, unit) : null;
    action = 'Change in Full view';
  }
  if (text === null) return null;

  return (
    <p className={`px-3 py-2 text-sm ${tone}`}>
      {text}{' '}
      <button type="button" onClick={openFull} className={LINK_BUTTON}>
        {action}
      </button>
    </p>
  );
}

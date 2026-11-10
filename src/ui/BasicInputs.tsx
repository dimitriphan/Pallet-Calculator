import { BoxesPerCartonField, SizeFieldsets } from './InputsPanel';
import { SettingsSummary } from './SettingsSummary';

/** Basic mode's inputs: the three sizes, boxes per carton, and the other settings in one line. */
export function BasicInputs() {
  return (
    <form className="space-y-5 p-4" onSubmit={(e) => e.preventDefault()}>
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Inputs</h2>
      <SizeFieldsets />
      <BoxesPerCartonField />
      <SettingsSummary />
    </form>
  );
}

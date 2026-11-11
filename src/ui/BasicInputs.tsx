import { BoxesPerCartonField, SizeFieldsets } from './InputsPanel';
import { SettingsSummary } from './SettingsSummary';
import { WeightFields } from './WeightFields';

/**
 * Basic mode's inputs: the three sizes, boxes per carton, the box weight and maximum, and the
 * other settings in one line.
 */
export function BasicInputs() {
  return (
    <form className="space-y-5 p-4" onSubmit={(e) => e.preventDefault()}>
      <h2 className="heading text-sm text-gray-900 dark:text-harbor-foam">Inputs</h2>
      <SizeFieldsets />
      <BoxesPerCartonField />
      <WeightFields full={false} />
      <SettingsSummary />
    </form>
  );
}

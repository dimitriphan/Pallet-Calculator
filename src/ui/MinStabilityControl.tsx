import type { MinStability } from '../domain/types';
import { MIN_STABILITY_LABEL, MIN_STABILITY_OPTIONS } from './minStability';
import { SegmentedChoice } from './SegmentedChoice';
import { useInputs } from './StoreContext';

interface MinStabilityFieldsProps {
  value: MinStability;
  onChange(m: MinStability): void;
}

const HINT: Record<MinStability, string> = {
  auto: 'The layout with the most boxes comes first, whatever its rating.',
  fair: 'Layouts rated Poor are left out.',
  good: 'Layouts rated Fair or Poor are left out.',
};

/** "Minimum stability": Auto, Fair or better, Good only, as one row of radio buttons. */
export function MinStabilityFields({ value, onChange }: MinStabilityFieldsProps) {
  return (
    <SegmentedChoice
      label="Minimum stability"
      options={MIN_STABILITY_OPTIONS}
      labels={MIN_STABILITY_LABEL}
      hints={HINT}
      value={value}
      onChange={onChange}
    />
  );
}

/** The minimum stability of the inputs being edited in the workspace (Full view only). */
export function MinStabilityControl() {
  const value = useInputs((s) => s.draft.minStability);
  const setMinStability = useInputs((s) => s.setMinStability);
  return <MinStabilityFields value={value} onChange={setMinStability} />;
}

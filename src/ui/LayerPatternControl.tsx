import type { LayerPatternPref } from '../domain/types';
import { LAYER_PATTERN_LABEL, LAYER_PATTERN_OPTIONS } from './layerPattern';
import { SegmentedChoice } from './SegmentedChoice';
import { useInputs } from './StoreContext';

interface LayerPatternFieldsProps {
  value: LayerPatternPref;
  onChange(p: LayerPatternPref): void;
}

const HINT: Record<LayerPatternPref, string> = {
  auto: 'A pinwheel layer is used only where it holds more cartons than straight cuts.',
  preferPinwheel: 'Among layouts with the same number of boxes, pinwheel layouts come first.',
  pinwheelOnly: 'Straight-cut layouts are left out.',
};

/** "Layer pattern": Auto, Prefer pinwheel, Pinwheel only, as one row of radio buttons. */
export function LayerPatternFields({ value, onChange }: LayerPatternFieldsProps) {
  return (
    <SegmentedChoice
      label="Layer pattern"
      options={LAYER_PATTERN_OPTIONS}
      labels={LAYER_PATTERN_LABEL}
      hints={HINT}
      value={value}
      onChange={onChange}
    />
  );
}

/** The layer pattern setting of the inputs being edited in the workspace (Full view only). */
export function LayerPatternControl() {
  const value = useInputs((s) => s.draft.layerPattern);
  const setLayerPattern = useInputs((s) => s.setLayerPattern);
  return <LayerPatternFields value={value} onChange={setLayerPattern} />;
}

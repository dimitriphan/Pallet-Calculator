import { PALLET_HEIGHT } from '../domain/constants';
import { inputFieldValue } from '../store/inputsStore';
import { AdvancedSection } from './AdvancedSection';
import { DimsFieldset } from './DimsFieldset';
import { NumberField } from './NumberField';
import { RotationControl } from './RotationControl';
import { lengthText, palletNotice, useUnit } from './format';
import { useInputs } from './StoreContext';

const NO_ERRORS: Record<string, string> = {};
const DIM_LABELS = { length: 'Length', width: 'Width', height: 'Height' };
const MAX_LABELS = { length: 'Max length', width: 'Max width', height: 'Max height' };

/** Usable stacking height (inches) from the typed pallet height, or null while that is invalid. */
function usableHeightOf(height: number | null): number | null {
  return height !== null && height > PALLET_HEIGHT ? height - PALLET_HEIGHT : null;
}

/**
 * The pallet, product and maximum carton sizes, with the pallet notice and a root divider
 * between them; shared by both views.
 */
export function SizeFieldsets() {
  const draft = useInputs((s) => s.draft);
  const errors = useInputs((s) => (s.parsed.ok ? NO_ERRORS : s.parsed.errors));
  const setField = useInputs((s) => s.setField);
  const unit = useUnit();
  const usable = usableHeightOf(useInputs((s) => inputFieldValue(s, 'pallet.height')));

  return (
    <>
      <DimsFieldset
        legend="Pallet limitation"
        group="pallet"
        labels={DIM_LABELS}
        values={draft.pallet}
        errors={errors}
        onChange={setField}
        heightHint={
          <>
            <p className="border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900 dark:border-b-0 dark:border-r-0 dark:border-harbor-sand dark:bg-harbor-panel dark:text-harbor-sand">
              {palletNotice(unit)}
            </p>
            <p className="mt-1 tabular-nums text-gray-700 dark:text-harbor-mist">
              {usable === null
                ? 'Usable stacking height: —'
                : `Usable stacking height: ${lengthText(usable, unit)}`}
            </p>
          </>
        }
      />
      <div className="root-divider" aria-hidden="true" />
      <DimsFieldset
        legend="Product box"
        group="product"
        labels={DIM_LABELS}
        values={draft.product}
        errors={errors}
        onChange={setField}
      />
      <div className="root-divider" aria-hidden="true" />
      <DimsFieldset
        legend="Maximum carton"
        group="maxCarton"
        labels={MAX_LABELS}
        values={draft.maxCarton}
        errors={errors}
        onChange={setField}
      />
    </>
  );
}

/** The optional "Desired boxes per carton" field; shared by both views. */
export function BoxesPerCartonField() {
  const value = useInputs((s) => s.draft.boxesPerCarton);
  const error = useInputs((s) => (s.parsed.ok ? undefined : s.parsed.errors.boxesPerCarton));
  const setField = useInputs((s) => s.setField);
  return (
    <NumberField
      id="field-boxesPerCarton"
      label="Desired boxes per carton"
      value={value}
      placeholder="Blank = best fit"
      suffix="boxes"
      error={error}
      onChange={(v) => setField('boxesPerCarton', v)}
    />
  );
}

/** Every input the optimizer uses, grouped, with inline validation. */
export function InputsPanel() {
  const draft = useInputs((s) => s.draft);
  const errors = useInputs((s) => (s.parsed.ok ? NO_ERRORS : s.parsed.errors));
  const setField = useInputs((s) => s.setField);

  return (
    <form className="space-y-5 p-4" onSubmit={(e) => e.preventDefault()}>
      <h2 className="heading text-sm text-gray-900 dark:text-harbor-foam">Inputs</h2>
      <SizeFieldsets />
      <div className="root-divider" aria-hidden="true" />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs heading text-gray-500 dark:text-harbor-mist">
          Packing
        </legend>
        <BoxesPerCartonField />
        <NumberField
          id="field-targetQuantity"
          label="Desired box quantity"
          value={draft.targetQuantity}
          placeholder="Blank = maximize"
          suffix="boxes"
          error={errors.targetQuantity}
          onChange={(v) => setField('targetQuantity', v)}
        />
        <NumberField
          id="field-leeway"
          label="Box leeway"
          value={draft.leeway}
          error={errors.leeway}
          hint="Added once per carton dimension."
          onChange={(v) => setField('leeway', v)}
        />
        <NumberField
          id="field-wallThickness"
          label="Carton wall thickness"
          value={draft.wallThickness}
          error={errors.wallThickness}
          onChange={(v) => setField('wallThickness', v)}
        />
        <NumberField
          id="field-overhang"
          label="Pallet overhang"
          value={draft.overhang}
          error={errors.overhang}
          onChange={(v) => setField('overhang', v)}
        />
      </fieldset>
      <div className="root-divider" aria-hidden="true" />
      <RotationControl />
      <AdvancedSection />
    </form>
  );
}

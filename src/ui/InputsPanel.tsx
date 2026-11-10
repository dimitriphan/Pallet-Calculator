import { PALLET_HEIGHT } from '../domain/constants';
import { formatNumber } from '../engine/units/units';
import { AdvancedSection } from './AdvancedSection';
import { DimsFieldset } from './DimsFieldset';
import { NumberField } from './NumberField';
import { RotationControl } from './RotationControl';
import { useInputs } from './StoreContext';

const NO_ERRORS: Record<string, string> = {};
const DIM_LABELS = { length: 'Length', width: 'Width', height: 'Height' };
const MAX_LABELS = { length: 'Max length', width: 'Max width', height: 'Max height' };
const DECIMAL = /^\d+(\.\d+)?$|^\.\d+$/;

/** Usable stacking height from the typed pallet height, or null while that is invalid. */
function usableHeightOf(text: string): number | null {
  const t = text.trim();
  if (!DECIMAL.test(t)) return null;
  const h = Number(t);
  return h > PALLET_HEIGHT ? h - PALLET_HEIGHT : null;
}

/** The pallet, product and maximum carton sizes, with the pallet notice; shared by both views. */
export function SizeFieldsets() {
  const draft = useInputs((s) => s.draft);
  const errors = useInputs((s) => (s.parsed.ok ? NO_ERRORS : s.parsed.errors));
  const setField = useInputs((s) => s.setField);
  const usable = usableHeightOf(draft.pallet.height);

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
            <p className="border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              A 5-inch pallet is automatically included. Available stacking height has been reduced
              by 5 inches.
            </p>
            <p className="mt-1 tabular-nums text-gray-700 dark:text-gray-300">
              {usable === null
                ? 'Usable stacking height: —'
                : `Usable stacking height: ${formatNumber(usable)} in`}
            </p>
          </>
        }
      />
      <DimsFieldset
        legend="Product box"
        group="product"
        labels={DIM_LABELS}
        values={draft.product}
        errors={errors}
        onChange={setField}
      />
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
      <h2 className="heading text-sm text-gray-900 dark:text-gray-100">Inputs</h2>
      <SizeFieldsets />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs heading text-gray-500 dark:text-gray-400">
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
      <RotationControl />
      <AdvancedSection />
    </form>
  );
}

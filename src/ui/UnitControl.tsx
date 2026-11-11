import { useEffect, useId } from 'react';
import type { Unit } from '../engine/units/units';
import { useStores } from './StoreContext';
import { useUnit } from './useUnit';

const OPTIONS: Unit[] = ['in', 'cm', 'mm'];

/**
 * Display unit: inches, centimetres or millimetres. Only what is shown changes; the inputs
 * and the result stay as they are, so nothing is recalculated.
 */
export function UnitControl() {
  const { inputs, prefs } = useStores();
  const unit = useUnit();
  const id = useId();
  const choose = (u: Unit) => {
    inputs.getState().setUnit(u);
    prefs.getState().setUnit(u);
  };
  return (
    <div className="flex items-center gap-1 xl:gap-2">
      <label
        htmlFor={id}
        className="sr-only text-sm text-gray-700 xl:not-sr-only dark:text-harbor-mist"
      >
        Units
      </label>
      <span className="focus-ticks-within flex">
        <select
          id={id}
          value={unit}
          onChange={(e) => choose(e.target.value as Unit)}
          className="border border-gray-300 bg-white px-1 py-1 text-sm focus:outline-none 2xl:px-2 dark:border-harbor-foam dark:bg-harbor-raised dark:text-harbor-foam"
        >
          {OPTIONS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

/**
 * On startup, the unit the inputs were remembered in wins: the preference follows it, so the
 * header and the fields never disagree.
 */
export function useUnitSync(): void {
  const { inputs, prefs } = useStores();
  useEffect(() => {
    const unit = inputs.getState().unit;
    if (prefs.getState().unit !== unit) prefs.getState().setUnit(unit);
  }, [inputs, prefs]);
}

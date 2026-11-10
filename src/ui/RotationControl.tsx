import type { OrientationCode, RotationMode } from '../domain/types';
import { useInputs } from './StoreContext';

const MODES: { value: RotationMode; label: string }[] = [
  { value: 'full', label: 'Fully rotatable' },
  { value: 'upright', label: 'Keep upright' },
  { value: 'noSide', label: 'No side rotation' },
  { value: 'custom', label: 'Custom' },
];

const CODES: OrientationCode[] = ['LWH', 'LHW', 'WLH', 'WHL', 'HLW', 'HWL'];

/** Product rotation mode, the custom orientation checkboxes, and "Keep cartons upright". */
export function RotationControl() {
  const mode = useInputs((s) => s.draft.rotationMode);
  const custom = useInputs((s) => s.draft.customOrientations);
  const keepUpright = useInputs((s) => s.draft.keepCartonsUpright);
  const error = useInputs((s) => (s.parsed.ok ? undefined : s.parsed.errors.customOrientations));
  const setRotationMode = useInputs((s) => s.setRotationMode);
  const toggleOrientation = useInputs((s) => s.toggleOrientation);
  const setKeepCartonsUpright = useInputs((s) => s.setKeepCartonsUpright);

  const chooseMode = (next: RotationMode) => {
    // Custom starts with every orientation ticked (the same as fully rotatable), so the
    // user narrows it down rather than meeting an error straight away.
    if (next === 'custom' && custom.length === 0) for (const c of CODES) toggleOrientation(c);
    setRotationMode(next);
  };

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Product rotation
        </legend>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {MODES.map((m) => (
            <label key={m.value} className="flex items-center gap-1.5 text-sm text-gray-800">
              <input
                type="radio"
                name="rotation-mode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => chooseMode(m.value)}
                className="h-3.5 w-3.5 accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              />
              {m.label}
            </label>
          ))}
        </div>
        {mode === 'custom' && (
          <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2">
            <p id="custom-orientations-help" className="mb-1 text-xs text-gray-600">
              Product length, width and height along the carton's length, width and height.
            </p>
            <div
              className="grid grid-cols-3 gap-1"
              aria-describedby={
                error
                  ? 'custom-orientations-help custom-orientations-error'
                  : 'custom-orientations-help'
              }
            >
              {CODES.map((code) => (
                <label
                  key={code}
                  className="flex items-center gap-1.5 font-mono text-sm text-gray-800"
                >
                  <input
                    type="checkbox"
                    checked={custom.includes(code)}
                    onChange={() => toggleOrientation(code)}
                    aria-invalid={error ? 'true' : 'false'}
                    className="h-3.5 w-3.5 accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  />
                  {code}
                </label>
              ))}
            </div>
            {error && (
              <p id="custom-orientations-error" className="mt-1 text-xs text-red-700">
                {error}
              </p>
            )}
          </div>
        )}
      </fieldset>
      <label className="flex items-center gap-1.5 text-sm text-gray-800">
        <input
          type="checkbox"
          checked={keepUpright}
          onChange={(e) => setKeepCartonsUpright(e.target.checked)}
          className="h-3.5 w-3.5 accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        />
        Keep cartons upright
      </label>
    </div>
  );
}

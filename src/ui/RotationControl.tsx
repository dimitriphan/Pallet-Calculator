import type { OrientationCode, RotationMode } from '../domain/types';
import { useInputs } from './StoreContext';

const MODES: { value: RotationMode; label: string }[] = [
  { value: 'full', label: 'Fully rotatable' },
  { value: 'upright', label: 'Keep upright' },
  { value: 'noSide', label: 'No side rotation' },
  { value: 'custom', label: 'Custom' },
];

const CODES: OrientationCode[] = ['LWH', 'LHW', 'WLH', 'WHL', 'HLW', 'HWL'];

interface RotationFieldsProps {
  mode: RotationMode;
  custom: OrientationCode[];
  keepUpright: boolean;
  error?: string;
  /** Prefix of ids and the radio group name, so two instances can be on screen at once. */
  idPrefix?: string;
  setRotationMode(m: RotationMode): void;
  toggleOrientation(c: OrientationCode): void;
  setKeepCartonsUpright(v: boolean): void;
}

/** Product rotation mode, the custom orientation checkboxes, and "Keep cartons upright". */
export function RotationFields({
  mode,
  custom,
  keepUpright,
  error,
  idPrefix = '',
  setRotationMode,
  toggleOrientation,
  setKeepCartonsUpright,
}: RotationFieldsProps) {
  const helpId = `${idPrefix}custom-orientations-help`;
  const errorId = `${idPrefix}custom-orientations-error`;
  const chooseMode = (next: RotationMode) => {
    // Custom starts with every orientation ticked (the same as fully rotatable), so the
    // user narrows it down rather than meeting an error straight away.
    if (next === 'custom' && custom.length === 0) for (const c of CODES) toggleOrientation(c);
    setRotationMode(next);
  };

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-1 text-xs heading text-gray-500 dark:text-harbor-mist">
          Product rotation
        </legend>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {MODES.map((m) => (
            <label
              key={m.value}
              className="flex items-center gap-1.5 text-sm text-gray-800 dark:text-harbor-foam"
            >
              <input
                type="radio"
                name={`${idPrefix}rotation-mode`}
                value={m.value}
                checked={mode === m.value}
                onChange={() => chooseMode(m.value)}
                className="h-3.5 w-3.5 accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:accent-harbor-teal-fill dark:focus-visible:outline-harbor-teal-text"
              />
              {m.label}
            </label>
          ))}
        </div>
        {mode === 'custom' && (
          <div className="mt-2 border border-gray-200 bg-gray-50 p-2 dark:border-harbor-foam/40 dark:bg-harbor-raised">
            <p id={helpId} className="mb-1 text-xs text-gray-600 dark:text-harbor-mist">
              Product length, width and height along the carton's length, width and height.
            </p>
            <div
              role="group"
              aria-label="Custom orientations"
              aria-describedby={error ? `${helpId} ${errorId}` : helpId}
              aria-invalid={error ? 'true' : 'false'}
              className="grid grid-cols-3 gap-1"
            >
              {CODES.map((code) => (
                <label
                  key={code}
                  className="flex items-center gap-1.5 font-mono text-sm text-gray-800 dark:text-harbor-foam"
                >
                  <input
                    type="checkbox"
                    checked={custom.includes(code)}
                    onChange={() => toggleOrientation(code)}
                    aria-invalid={error ? 'true' : 'false'}
                    className="h-3.5 w-3.5 accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:accent-harbor-teal-fill dark:focus-visible:outline-harbor-teal-text"
                  />
                  {code}
                </label>
              ))}
            </div>
            {error && (
              <p id={errorId} className="mt-1 text-xs text-red-700 dark:text-harbor-coral-text">
                {error}
              </p>
            )}
          </div>
        )}
      </fieldset>
      <label className="flex items-center gap-1.5 text-sm text-gray-800 dark:text-harbor-foam">
        <input
          type="checkbox"
          checked={keepUpright}
          onChange={(e) => setKeepCartonsUpright(e.target.checked)}
          className="h-3.5 w-3.5 accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:accent-harbor-teal-fill dark:focus-visible:outline-harbor-teal-text"
        />
        Keep cartons upright
      </label>
    </div>
  );
}

/** The rotation fields bound to the inputs being edited in the workspace. */
export function RotationControl() {
  const mode = useInputs((s) => s.draft.rotationMode);
  const custom = useInputs((s) => s.draft.customOrientations);
  const keepUpright = useInputs((s) => s.draft.keepCartonsUpright);
  const error = useInputs((s) => (s.parsed.ok ? undefined : s.parsed.errors.customOrientations));
  const setRotationMode = useInputs((s) => s.setRotationMode);
  const toggleOrientation = useInputs((s) => s.toggleOrientation);
  const setKeepCartonsUpright = useInputs((s) => s.setKeepCartonsUpright);
  return (
    <RotationFields
      mode={mode}
      custom={custom}
      keepUpright={keepUpright}
      error={error}
      setRotationMode={setRotationMode}
      toggleOrientation={toggleOrientation}
      setKeepCartonsUpright={setKeepCartonsUpright}
    />
  );
}

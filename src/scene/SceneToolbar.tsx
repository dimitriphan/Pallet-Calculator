import { PRODUCT_FORCE_LIMIT, PRODUCT_RENDER_THRESHOLD } from '../domain/constants';
import type { ToggleKey } from '../store/sceneStore';
import { useScene } from '../ui/StoreContext';

const TOGGLES: [ToggleKey, string][] = [
  ['showProducts', 'Products'],
  ['showCartons', 'Cartons'],
  ['showLabels', 'Labels'],
  ['showEnvelope', 'Envelope'],
  ['showGrid', 'Grid'],
  ['showWireframe', 'Wireframe'],
  ['showMeasurements', 'Measurements'],
];

const BUTTON =
  'rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600';

/** View toggles and camera buttons for the 3D workspace. */
export function SceneToolbar({ totalProducts }: { totalProducts: number }) {
  const scene = useScene((s) => s);
  const productsHidden =
    scene.showProducts && totalProducts > PRODUCT_RENDER_THRESHOLD && !scene.forceProducts;

  return (
    <div className="border-b border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {TOGGLES.map(([key, label]) => (
          <label key={key} className="flex items-center gap-1">
            <input type="checkbox" checked={scene[key]} onChange={() => scene.toggle(key)} />
            {label}
          </label>
        ))}
        <span className="ml-auto flex gap-1.5">
          <button type="button" className={BUTTON} onClick={scene.resetView}>
            Reset view
          </button>
          <button type="button" className={BUTTON} onClick={scene.focusSelection}>
            Focus selection
          </button>
        </span>
      </div>
      {productsHidden && (
        <p role="status" className="mt-1 flex items-center gap-2 text-amber-800">
          {totalProducts > PRODUCT_FORCE_LIMIT ? (
            `Too many boxes to draw individually (${totalProducts.toLocaleString('en-US')}).`
          ) : (
            <>
              Products hidden: this layout has {totalProducts.toLocaleString('en-US')} boxes.
              <button
                type="button"
                className={BUTTON}
                onClick={() => scene.toggle('forceProducts')}
              >
                Show anyway
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}

import { lazy, Suspense, useState, type ComponentType, type ReactNode } from 'react';
import { SceneErrorBoundary } from './SceneErrorBoundary';
import { WEBGL_UNAVAILABLE, webglAvailable } from './webgl';

export const SCENE_LOAD_FAILED =
  'The 3D view could not be loaded. All numbers above remain accurate.';

type SceneModule = { default: ComponentType };

// Code-split: three.js loads only when the browser can show the 3D view.
const loadPalletScene = (): Promise<SceneModule> => import('./PalletScene');

function Message({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-gray-500 dark:text-harbor-mist">
      {children}
    </div>
  );
}

/**
 * The 3D view's slot. Imports nothing from three; the scene loads lazily, and a failed load
 * or render shows a message with Retry while the rest of the workspace stays mounted.
 */
export function SceneSlot({ load = loadPalletScene }: { load?: () => Promise<SceneModule> }) {
  // A rejected React.lazy stays rejected, so each attempt gets a fresh lazy component;
  // the attempt number also resets the error boundary.
  const [{ attempt, Scene }, setTry] = useState(() => ({ attempt: 0, Scene: lazy(load) }));
  const retry = () => setTry((t) => ({ attempt: t.attempt + 1, Scene: lazy(load) }));

  if (!webglAvailable()) return <Message>{WEBGL_UNAVAILABLE}</Message>;
  const failed = (
    <Message>
      {SCENE_LOAD_FAILED}
      <button
        type="button"
        onClick={retry}
        className="focus-ticks border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-harbor-foam dark:bg-harbor-raised dark:text-harbor-foam dark:hover:bg-harbor-raised dark:hover:underline"
      >
        Retry
      </button>
    </Message>
  );
  return (
    <SceneErrorBoundary key={attempt} fallback={failed}>
      <Suspense fallback={<Message>Loading 3D view…</Message>}>
        <Scene />
      </Suspense>
    </SceneErrorBoundary>
  );
}

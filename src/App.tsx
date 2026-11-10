import { lazy, Suspense } from 'react';
import { WEBGL_UNAVAILABLE, webglAvailable } from './scene/webgl';
import { DetailsPanel } from './ui/DetailsPanel';
import { Header } from './ui/Header';
import { InputsPanel } from './ui/InputsPanel';
import { LayoutComparisonTable } from './ui/LayoutComparisonTable';
import { Notices } from './ui/Notices';
import { ProductionSummary } from './ui/ProductionSummary';
import { StoreProvider, type AppStores } from './ui/StoreContext';
import { useAutoOptimize } from './ui/useAutoOptimize';

// Code-split: three.js loads only when the browser can show the 3D view.
const PalletScene = lazy(() => import('./scene/PalletScene'));

function SceneSlot() {
  const message = (text: string) => (
    <div className="flex h-full items-center justify-center p-4 text-center text-sm text-gray-500">
      {text}
    </div>
  );
  if (!webglAvailable()) return message(WEBGL_UNAVAILABLE);
  return (
    <Suspense fallback={message('Loading 3D view…')}>
      <PalletScene />
    </Suspense>
  );
}

function Workspace() {
  useAutoOptimize();
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-100 text-gray-900">
      <Header />
      <ProductionSummary />
      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside aria-label="Inputs" className="overflow-y-auto border-r border-gray-200 bg-white">
          <InputsPanel />
        </aside>
        <main className="min-w-0 space-y-4 overflow-y-auto p-4">
          <div
            data-testid="scene-slot"
            className="h-[420px] overflow-hidden rounded border border-gray-300 bg-white"
          >
            <SceneSlot />
          </div>
          <LayoutComparisonTable />
        </main>
        <aside aria-label="Details" className="overflow-y-auto border-l border-gray-200 bg-white">
          <DetailsPanel />
        </aside>
      </div>
      <Notices />
    </div>
  );
}

export default function App({ stores }: { stores?: AppStores }) {
  return (
    <StoreProvider stores={stores}>
      <Workspace />
    </StoreProvider>
  );
}

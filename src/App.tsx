import { SceneSlot } from './scene/SceneSlot';
import { BasicInputs } from './ui/BasicInputs';
import { DetailsPanel } from './ui/DetailsPanel';
import { Header } from './ui/Header';
import { InputsPanel } from './ui/InputsPanel';
import { LayoutComparisonTable } from './ui/LayoutComparisonTable';
import { Notices } from './ui/Notices';
import { StaleBadge } from './ui/StaleBadge';
import { ProductionSummary } from './ui/ProductionSummary';
import { StatusMessages } from './ui/StatusMessages';
import { StoreProvider, usePrefs, type AppStores } from './ui/StoreContext';
import { useAutoOptimize } from './ui/useAutoOptimize';
import { useTheme } from './ui/useTheme';
import { WhatToBuildCard } from './ui/WhatToBuildCard';

function Workspace() {
  useAutoOptimize();
  useTheme();
  // Both views share the shell and the scene slot's place in the tree, so switching
  // never remounts the 3D view or changes its size.
  const full = usePrefs((s) => s.viewMode) === 'full';
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <Header />
      <ProductionSummary />
      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside
          aria-label="Inputs"
          className="overflow-y-auto border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
        >
          {full ? <InputsPanel /> : <BasicInputs />}
        </aside>
        <main className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-4">
          <div
            data-testid="scene-slot"
            className="relative min-h-[320px] flex-1 overflow-hidden border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
          >
            <SceneSlot />
            <StaleBadge className="pointer-events-none absolute bottom-2 left-2 z-10" />
          </div>
          {full && <LayoutComparisonTable />}
        </main>
        <aside
          aria-label="Details"
          className="overflow-y-auto border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
        >
          {full ? (
            <DetailsPanel />
          ) : (
            // While the status live region is empty, the card needs no space-y margin above it.
            <div className="space-y-3 p-4 [&>[role=status]:empty+*]:!mt-0">
              <StatusMessages />
              <WhatToBuildCard />
            </div>
          )}
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

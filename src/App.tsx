import { DetailsPanel } from './ui/DetailsPanel';
import { Header } from './ui/Header';
import { InputsPanel } from './ui/InputsPanel';
import { LayoutComparisonTable } from './ui/LayoutComparisonTable';
import { Notices } from './ui/Notices';
import { ProductionSummary } from './ui/ProductionSummary';
import { StoreProvider, type AppStores } from './ui/StoreContext';
import { useAutoOptimize } from './ui/useAutoOptimize';

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
            className="flex h-[420px] items-center justify-center rounded border border-dashed border-gray-300 bg-white text-sm text-gray-400"
          >
            3D view
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

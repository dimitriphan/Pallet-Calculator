import { ExportMenu } from './ExportMenu';
import { PresetMenu } from './PresetMenu';
import { ScenarioDrawer } from './ScenarioDrawer';
import { usePrefs } from './StoreContext';
import { ThemeControl } from './ThemeControl';
import { ViewModeSwitch } from './ViewModeSwitch';

/** App name, with the preset and scenario controls on the right and export; no scenarios in Basic. */
export function Header() {
  const full = usePrefs((s) => s.viewMode) === 'full';
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-700 dark:bg-gray-900">
      <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        Pallet Calculator
      </h1>
      <div data-testid="header-actions" className="flex items-center gap-4">
        <PresetMenu />
        {full && <ScenarioDrawer />}
        <ExportMenu />
        <ViewModeSwitch />
        <ThemeControl />
      </div>
    </header>
  );
}

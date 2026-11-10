import { ExportMenu } from './ExportMenu';
import { Mascot } from './Mascot';
import { PresetMenu } from './PresetMenu';
import { ScenarioDrawer } from './ScenarioDrawer';
import { usePrefs } from './StoreContext';
import { ThemeControl } from './ThemeControl';
import { UnitControl } from './UnitControl';
import { ViewModeSwitch } from './ViewModeSwitch';

/** App name, with the preset and scenario controls on the right and export; no scenarios in Basic. */
export function Header() {
  const full = usePrefs((s) => s.viewMode) === 'full';
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 xl:px-4 dark:border-harbor-foam dark:bg-harbor-panel">
      <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
        <Mascot pose="header" />
        <h1 className="heading text-base text-gray-900 dark:text-harbor-foam">Pallet Calculator</h1>
      </div>
      <div
        data-testid="header-actions"
        className="flex items-center gap-1.5 whitespace-nowrap xl:gap-4"
      >
        <PresetMenu />
        {full && <ScenarioDrawer />}
        <ExportMenu />
        <ViewModeSwitch />
        <ThemeControl />
        <UnitControl />
      </div>
    </header>
  );
}

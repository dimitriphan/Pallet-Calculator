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
    <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b py-1 lg:h-12 lg:flex-nowrap lg:gap-0 lg:py-0 border-gray-200 bg-white px-3 2xl:px-4 dark:border-harbor-foam dark:bg-harbor-panel">
      <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
        <Mascot pose="header" />
        <h1 className="heading text-base text-gray-900 dark:text-harbor-foam">Pallet Calculator</h1>
      </div>
      <div
        data-testid="header-actions"
        // Below 1024 px the controls wrap on to further rows instead of running off the page.
        className="flex min-w-0 flex-wrap items-center gap-1 whitespace-nowrap lg:flex-nowrap xl:gap-1.5 2xl:gap-4"
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

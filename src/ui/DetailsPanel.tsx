import { useRef, useState, type KeyboardEvent } from 'react';
import { AnalyticsTab } from './AnalyticsTab';
import { ExplanationTab } from './ExplanationTab';
import { SelectionTab } from './SelectionTab';
import { StaleBadge } from './StaleBadge';
import { useScene } from './StoreContext';
import { useSelectedAnalytics } from './useSelectedAnalytics';

const TABS = ['Analytics', 'Explanation', 'Selection'] as const;
type Tab = (typeof TABS)[number];

/** Analytics, score explanation and 3D selection details for the selected layout. */
export function DetailsPanel() {
  const [active, setActive] = useState<Tab>('Analytics');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = useSelectedAnalytics();
  const selection = useScene((s) => s.selection);

  const onKeyDown = (e: KeyboardEvent) => {
    const k = TABS.indexOf(active);
    const next =
      e.key === 'ArrowRight'
        ? (k + 1) % TABS.length
        : e.key === 'ArrowLeft'
          ? (k + TABS.length - 1) % TABS.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? TABS.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    setActive(TABS[next] as Tab);
    tabRefs.current[next]?.focus();
  };

  let content;
  if (!selected)
    content = <p className="text-sm text-gray-600 dark:text-gray-300">No layout to show yet.</p>;
  else if (active === 'Analytics') content = <AnalyticsTab analytics={selected.analytics} />;
  else if (active === 'Explanation') content = <ExplanationTab ranked={selected.ranked} />;
  else
    content = (
      <SelectionTab
        selection={selection}
        layout={selected.ranked.layout}
        inputs={selected.inputs}
        analytics={selected.analytics}
      />
    );

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center border-b border-gray-200 bg-white px-2 dark:border-gray-700 dark:bg-gray-900">
        <div role="tablist" aria-label="Details" className="flex" onKeyDown={onKeyDown}>
          {TABS.map((tab, k) => {
            const isActive = tab === active;
            return (
              <button
                key={tab}
                ref={(el) => {
                  tabRefs.current[k] = el;
                }}
                type="button"
                role="tab"
                id={`details-tab-${tab}`}
                aria-selected={isActive}
                aria-controls={isActive ? `details-panel-${tab}` : undefined}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActive(tab)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400 ${
                  isActive
                    ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>
        <StaleBadge className="ml-auto" />
      </div>
      <div
        role="tabpanel"
        id={`details-panel-${active}`}
        aria-labelledby={`details-tab-${active}`}
        tabIndex={0}
        className="flex-1 p-4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"
      >
        {content}
      </div>
    </div>
  );
}

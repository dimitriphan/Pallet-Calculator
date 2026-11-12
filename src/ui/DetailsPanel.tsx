import { useRef, useState, type KeyboardEvent } from 'react';
import { AnalyticsTab } from './AnalyticsTab';
import { EDITOR_ENTRY_REASON_ID, useEditorEntry } from './editor/useEditorEntry';
import { ExplanationTab } from './ExplanationTab';
import { BUTTON } from './ModalDialog';
import { SelectionTab } from './SelectionTab';
import { StaleBadge } from './StaleBadge';
import { useResults, useScene } from './StoreContext';
import { useSelectedAnalytics } from './useSelectedAnalytics';

const TABS = ['Analytics', 'Explanation', 'Selection'] as const;
type Tab = (typeof TABS)[number];

/** Analytics, score explanation and 3D selection details for the selected layout. */
export function DetailsPanel() {
  const [active, setActive] = useState<Tab>('Analytics');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = useSelectedAnalytics();
  const selection = useScene((s) => s.selection);
  const selectedIndex = useResults((s) => s.selectedIndex);
  const entry = useEditorEntry();
  // A manual layout that is out of date can only be rebuilt, not edited as it stands.
  const outOfDate = selected?.ranked.manual?.status === 'outOfDate';
  const editOff = entry.blocked !== null || outOfDate;
  const edit = () => {
    const manual = selected?.ranked.manual;
    if (manual) entry.openSaved(manual.id);
    else entry.openCalculated(selectedIndex);
  };

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
    content = <p className="text-sm text-gray-600 dark:text-harbor-mist">No layout to show yet.</p>;
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
      <div className="sticky top-0 z-10 flex items-center border-b border-gray-200 bg-white px-2 dark:border-harbor-foam/40 dark:bg-harbor-panel">
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
                className={`focus-ticks-inset -mb-px border-b-2 px-3 py-2 text-sm ${
                  isActive
                    ? 'border-blue-600 text-blue-700 dark:border-harbor-teal dark:text-harbor-teal-text'
                    : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-harbor-mist dark:hover:text-harbor-foam'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>
        <StaleBadge className="ml-auto" />
      </div>
      {selected && (
        <div className="border-b border-gray-200 px-4 py-2 dark:border-harbor-foam/40">
          <button
            type="button"
            disabled={editOff}
            aria-describedby={entry.blocked ? EDITOR_ENTRY_REASON_ID : undefined}
            title={entry.blocked ?? undefined}
            onClick={edit}
            className={BUTTON}
          >
            Edit layout by hand
          </button>
        </div>
      )}
      <div
        role="tabpanel"
        id={`details-panel-${active}`}
        aria-labelledby={`details-tab-${active}`}
        tabIndex={0}
        className="focus-ticks-inset flex-1 p-4"
      >
        {content}
      </div>
    </div>
  );
}

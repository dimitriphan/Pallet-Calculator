import { useRef, useState, type KeyboardEvent } from 'react';
import { AnalyticsTab } from './AnalyticsTab';
import { EDITOR_ENTRY_REASON_ID, useEditorEntry } from './editor/useEditorEntry';
import { ExplanationTab } from './ExplanationTab';
import { BUTTON } from './ModalDialog';
import { SelectionTab } from './SelectionTab';
import { StaleBadge } from './StaleBadge';
import { useResults, useScene } from './StoreContext';
import { useSelectedAnalytics } from './useSelectedAnalytics';

/** Why a selected manual layout that is out of date cannot be edited as it stands. */
export const EDIT_OUT_OF_DATE =
  'This layout is out of date. Rebuild it under “Your layouts” to edit it.';
const EDIT_REASON_ID = 'details-edit-reason';

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
  const manualSelected = selected?.ranked.manual !== undefined;
  // Why the button is off, said in its title and described to a screen reader.
  const editReason = outOfDate
    ? EDIT_OUT_OF_DATE
    : manualSelected
      ? entry.blocked
      : entry.blockedCalculated;
  const editOff = editReason !== null;
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
  else if (active === 'Analytics')
    content = <AnalyticsTab analytics={selected.analytics} unchecked={outOfDate} />;
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
            // Any other reason is the line by the entry buttons over the comparison table.
            aria-describedby={
              outOfDate ? EDIT_REASON_ID : editOff ? EDITOR_ENTRY_REASON_ID : undefined
            }
            title={editReason ?? undefined}
            onClick={edit}
            className={BUTTON}
          >
            Edit layout by hand
          </button>
          {outOfDate && (
            <p id={EDIT_REASON_ID} className="mt-1 text-xs text-gray-600 dark:text-harbor-mist">
              {editReason}
            </p>
          )}
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

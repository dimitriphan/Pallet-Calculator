import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SceneSlot } from './scene/SceneSlot';
import { BasicInputs } from './ui/BasicInputs';
import { DetailsPanel } from './ui/DetailsPanel';
import { EditorBar } from './ui/editor/EditorBar';
import { EditorPanel } from './ui/editor/EditorPanel';
import { EditorBlocked, type EditorBlock } from './ui/editor/EditorBlocked';
import { DESIGN_OWN_ID, returnEditorFocus, useWideEnough } from './ui/editor/useEditorEntry';
import { Header } from './ui/Header';
import { InputsPanel } from './ui/InputsPanel';
import { LayoutComparisonTable } from './ui/LayoutComparisonTable';
import { Notices } from './ui/Notices';
import { StaleBadge } from './ui/StaleBadge';
import { ProductionSummary } from './ui/ProductionSummary';
import { StatusMessages } from './ui/StatusMessages';
import { StoreProvider, useManualEditor, usePrefs, type AppStores } from './ui/StoreContext';
import { useAutoOptimize } from './ui/useAutoOptimize';
import { useTheme } from './ui/useTheme';
import { useUnitSync } from './ui/UnitControl';
import { YourLayouts } from './ui/YourLayouts';
import { WHAT_TO_BUILD_HEADING_ID, WhatToBuildCard } from './ui/WhatToBuildCard';

function Workspace() {
  useAutoOptimize();
  useTheme();
  useUnitSync();
  // Both views share the shell and the scene slot's place in the tree, so switching
  // never remounts the 3D view or changes its size.
  const full = usePrefs((s) => s.viewMode) === 'full';
  // While a layout is edited by hand (spec 6.2a, 6.2b) the editor's bar stands over the 3D
  // view and the current step's controls take the details column. Below 1280 px there is no
  // room for the inputs as well: they give way to the editor, and from 1024 px can be shown.
  const session = useManualEditor((s) => s.session);
  const editing = session !== null;
  const [inputsShown, setInputsShown] = useState(false);
  const inputsFrom = !editing ? null : inputsShown ? 'lg' : 'xl';
  const wasEditing = useRef(false);
  useEffect(() => {
    // The editor has closed: the keyboard user goes back to the control that opened it, or
    // where editing starts when that is gone (in Basic view, the card's heading).
    if (wasEditing.current && !editing)
      returnEditorFocus([DESIGN_OWN_ID, WHAT_TO_BUILD_HEADING_ID]);
    wasEditing.current = editing;
  }, [editing]);
  // A session that cannot be worked in as the window or the view now is: it is kept, covered
  // by a notice, rather than left half-usable.
  const wide = useWideEnough();
  const block: EditorBlock | null = !editing ? null : !wide ? 'narrow' : !full ? 'basic' : null;
  const sceneArea = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Nothing under the notice can be focused or pressed.
    if (sceneArea.current) sceneArea.current.inert = block !== null;
  }, [block]);
  // Leaving or reloading the page with unsaved work in the editor asks first.
  const dirty = session?.dirty ?? false;
  useEffect(() => {
    if (!dirty) return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome asks only when this is set as well.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [dirty]);
  const main = useRef<HTMLElement>(null);
  const results = useRef<HTMLDivElement>(null);
  // Before the effect above: the focus goes back to a control in the results when it closes.
  useLayoutEffect(() => {
    if (results.current) results.current.inert = editing;
    // The editor opens at the top of its column, whatever was scrolled to before.
    if (editing && main.current) main.current.scrollTop = 0;
  }, [editing, full]);
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-100 text-gray-900 dark:bg-harbor-deep dark:text-harbor-foam">
      <Header />
      <ProductionSummary />
      <div
        className={`grid min-h-0 flex-1 ${
          inputsFrom === null
            ? 'grid-cols-[320px_minmax(0,1fr)_360px]'
            : inputsFrom === 'lg'
              ? 'grid-cols-[minmax(0,1fr)_360px] lg:grid-cols-[320px_minmax(0,1fr)_360px]'
              : 'grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[320px_minmax(0,1fr)_360px]'
        }`}
      >
        <aside
          aria-label="Inputs"
          className={`relative overflow-y-auto border-r border-gray-200 bg-white dark:border-harbor-foam/40 dark:bg-harbor-panel ${
            inputsFrom === null ? '' : inputsFrom === 'lg' ? 'hidden lg:block' : 'hidden xl:block'
          }`}
        >
          {full ? <InputsPanel /> : <BasicInputs />}
        </aside>
        <main
          ref={main}
          className="relative flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-4"
        >
          <div
            data-testid="scene-slot"
            className={`relative flex flex-col border bg-white dark:bg-harbor-panel ${
              editing
                ? // The editor takes the whole height of the column, so its tools and its view
                  // are all in sight with nothing to scroll (a finger on the view cannot
                  // scroll the page). Where the window is too low for that, the view keeps a
                  // least height and the column scrolls.
                  'h-full min-h-min shrink-0 overflow-clip border-blue-700 dark:border-harbor-teal'
                : 'min-h-[320px] flex-1 overflow-hidden border-gray-300 dark:border-harbor-foam/40'
            }`}
          >
            {session && !block && (
              <EditorBar
                session={session}
                inputsToggle={{ shown: inputsShown, toggle: () => setInputsShown((v) => !v) }}
              />
            )}
            {session && block && <EditorBlocked block={block} dirty={session.dirty} />}
            <div
              ref={sceneArea}
              className={`relative flex-1 ${editing ? 'min-h-[300px]' : 'min-h-0'}`}
            >
              <div className="absolute inset-0">
                <SceneSlot />
              </div>
            </div>
            {!editing && (
              <StaleBadge className="pointer-events-none absolute bottom-2 left-2 z-10" />
            )}
          </div>
          {full && (
            // While a layout is edited the editor has the whole column: the results are put
            // away (hidden and inert), so they are not in the tab order between the 3D view and
            // the editor's panel, and nothing is left to scroll to under the editor.
            <div
              ref={results}
              data-testid="results-region"
              className={`shrink-0 flex-col gap-4 ${editing ? 'hidden' : 'flex'}`}
            >
              <YourLayouts />
              <LayoutComparisonTable />
            </div>
          )}
        </main>
        <aside
          aria-label={editing ? 'Editor step' : 'Details'}
          className="relative overflow-y-auto border-l border-gray-200 bg-white dark:border-harbor-foam/40 dark:bg-harbor-panel"
        >
          {session && block ? (
            <p className="p-4 text-sm text-gray-700 dark:text-harbor-mist">
              Editing by hand is paused.
            </p>
          ) : session ? (
            <EditorPanel session={session} />
          ) : full ? (
            <DetailsPanel />
          ) : (
            // While the status live region is empty, the card needs no space-y margin above it.
            <div className="space-y-3 p-4 [&>[role=status]:empty+*]:!mt-0">
              <StatusMessages forSelection />
              <YourLayouts compact />
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

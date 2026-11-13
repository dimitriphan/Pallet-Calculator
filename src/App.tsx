import { useEffect, useRef, useState } from 'react';
import { SceneSlot } from './scene/SceneSlot';
import { BasicInputs } from './ui/BasicInputs';
import { DetailsPanel } from './ui/DetailsPanel';
import { EditorBar } from './ui/editor/EditorBar';
import { EditorPanel } from './ui/editor/EditorPanel';
import { DESIGN_OWN_ID } from './ui/editor/useEditorEntry';
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
import { WhatToBuildCard } from './ui/WhatToBuildCard';

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
    // The editor has closed: the keyboard user goes back to where editing starts.
    if (wasEditing.current && !editing) document.getElementById(DESIGN_OWN_ID)?.focus();
    wasEditing.current = editing;
  }, [editing]);
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
          className={`overflow-y-auto border-r border-gray-200 bg-white dark:border-harbor-foam/40 dark:bg-harbor-panel ${
            inputsFrom === null ? '' : inputsFrom === 'lg' ? 'hidden lg:block' : 'hidden xl:block'
          }`}
        >
          {full ? <InputsPanel /> : <BasicInputs />}
        </aside>
        <main className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-4">
          <div
            data-testid="scene-slot"
            className={`relative flex flex-1 flex-col overflow-hidden border bg-white dark:bg-harbor-panel ${
              editing
                ? `${
                    // The layer step has a row of tools more (which wraps in a narrow column), and
                    // its view is worked in.
                    session?.step === 'layer' ? 'min-h-[840px] xl:min-h-[680px]' : 'min-h-[520px]'
                  } border-blue-700 dark:border-harbor-teal`
                : 'min-h-[320px] border-gray-300 dark:border-harbor-foam/40'
            }`}
          >
            {session && (
              <EditorBar
                session={session}
                inputsToggle={{ shown: inputsShown, toggle: () => setInputsShown((v) => !v) }}
              />
            )}
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0">
                <SceneSlot />
              </div>
            </div>
            {!editing && (
              <StaleBadge className="pointer-events-none absolute bottom-2 left-2 z-10" />
            )}
          </div>
          {full && <LayoutComparisonTable />}
        </main>
        <aside
          aria-label={editing ? 'Editor step' : 'Details'}
          className="overflow-y-auto border-l border-gray-200 bg-white dark:border-harbor-foam/40 dark:bg-harbor-panel"
        >
          {session ? (
            <EditorPanel session={session} />
          ) : full ? (
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

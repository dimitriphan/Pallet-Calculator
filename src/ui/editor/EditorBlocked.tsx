import { useEffect, useRef, useState } from 'react';
import { useManualEditor, useStores } from '../StoreContext';
import { ConfirmDialog } from './ConfirmDialog';
import { EDITOR_MIN_WIDTH } from './useEditorEntry';
import { EDITOR_BUTTON, EDITOR_PRIMARY } from './styles';

/** Why an open editing session cannot be worked in right now. */
export type EditorBlock = 'narrow' | 'basic';

export const EDITOR_BLOCKS: Record<EditorBlock, { title: string; text: string }> = {
  narrow: {
    title: 'Editing needs a wider screen',
    text: `Your layout is kept as you left it. Make the window at least ${EDITOR_MIN_WIDTH} px wide to go on editing.`,
  },
  basic: {
    title: 'Editing is in Full view',
    text: 'Your layout is kept as you left it. Switch to Full view to go on editing.',
  },
};

/**
 * Shown over the editor while a layout is being edited but the window has become too narrow,
 * or the view was switched to Basic: the session is kept, nothing of it can be half-used, and
 * the way back (or out) is offered.
 */
export function EditorBlocked({ block, dirty }: { block: EditorBlock; dirty: boolean }) {
  const { prefs } = useStores();
  const cancel = useManualEditor((s) => s.cancel);
  const [confirm, setConfirm] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [block]);
  const { title, text } = EDITOR_BLOCKS[block];
  return (
    <section
      aria-labelledby="editor-blocked-title"
      data-testid="editor-blocked"
      className="absolute inset-0 z-20 flex flex-col items-start justify-center gap-3 overflow-y-auto border-2 border-blue-700 bg-white p-4 text-gray-900 dark:border-harbor-teal dark:bg-harbor-panel dark:text-harbor-foam"
    >
      <h2
        ref={heading}
        id="editor-blocked-title"
        tabIndex={-1}
        className="heading text-lg focus:outline-none"
      >
        {title}
      </h2>
      <p className="max-w-prose text-sm">{text}</p>
      <div className="flex flex-wrap gap-2">
        {block === 'basic' && (
          <button
            type="button"
            onClick={() => prefs.getState().setViewMode('full')}
            className={EDITOR_PRIMARY}
          >
            Switch to Full view
          </button>
        )}
        <button
          type="button"
          onClick={() => (dirty ? setConfirm(true) : cancel())}
          className={EDITOR_BUTTON}
        >
          Stop editing
        </button>
      </div>
      {confirm && (
        <ConfirmDialog
          title="Discard your changes?"
          confirm="Discard changes"
          keep="Keep the layout"
          onKeep={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            cancel();
          }}
        >
          <p>What you changed in this layout has not been saved and will be lost.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

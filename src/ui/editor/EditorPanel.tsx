import type { EditorSession } from '../../store/manualEditorStore';
import { EDITOR_PANEL_ID, STEPS, stepTabId } from './steps';

/**
 * The current step's controls and figures, beside the 3D view, in the place the details of the
 * selected layout usually take.
 */
export function EditorPanel({ session }: { session: EditorSession }) {
  const { Panel, label } = STEPS[session.step];
  return (
    <div
      role="tabpanel"
      id={EDITOR_PANEL_ID}
      aria-labelledby={stepTabId(session.step)}
      className="min-h-full border-t-2 border-blue-700 p-4 dark:border-harbor-teal"
    >
      <h2 className="heading mb-3 text-lg text-gray-900 dark:text-harbor-foam">{label}</h2>
      <Panel session={session} />
    </div>
  );
}

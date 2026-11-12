import type { ComponentType } from 'react';
import type { EditorSession, EditorStep } from '../../store/manualEditorStore';
import { CartonStep } from './CartonStep';
import { LayerStep } from './LayerStep';

export interface StepParts {
  /** The step's tab. */
  label: string;
  /** The step's controls and figures, shown beside the 3D view. */
  Panel: ComponentType<{ session: EditorSession }>;
  /**
   * The step's own row of tools in the editor bar, above the 3D view, or null when it has
   * none. The Pallet layer step's tools (add, turn, remove, reset, snapping) go here.
   */
  Tools: ComponentType<{ session: EditorSession }> | null;
}

/**
 * What each step of the editor is made of. The shell (EditorBar, EditorPanel) only reads this;
 * the 3D side of a step is in src/scene/EditorScene.tsx.
 */
export const STEPS: Record<EditorStep, StepParts> = {
  carton: { label: 'Carton', Panel: CartonStep, Tools: null },
  layer: { label: 'Pallet layer', Panel: LayerStep, Tools: null },
};

export const STEP_ORDER: readonly EditorStep[] = ['carton', 'layer'];

/** Ids that tie the step tabs in the bar to the panel beside the view. */
export const stepTabId = (step: EditorStep) => `editor-tab-${step}`;
export const EDITOR_PANEL_ID = 'editor-step-panel';

import { useLayoutEffect, useRef, type RefObject } from 'react';

export interface FocusHandOff<E extends HTMLElement = HTMLButtonElement> {
  ref: RefObject<E>;
  onFocus(): void;
  onBlur(): void;
}

/**
 * For a button that can disable itself while it has the focus (the last Undo, a stepper at its
 * limit): when that happens the focus is handed to a neighbour instead of falling to the page,
 * where a keyboard user would have to find their way back. Spread what it returns on the button.
 */
export function useFocusHandOff<E extends HTMLElement = HTMLButtonElement>(
  disabled: boolean,
  /** Where the focus goes: the first of these that is there and can take it. */
  to: () => (HTMLElement | null | undefined)[],
  /** The button's ref, when the caller needs it too (two buttons that hand off to each other). */
  given?: RefObject<E>,
): FocusHandOff<E> {
  const own = useRef<E>(null);
  const ref = given ?? own;
  // Browsers drop the focus from a control as it is disabled without a blur event, so the
  // control's own record of having had it is what tells.
  const had = useRef(false);
  const target = useRef(to);
  useLayoutEffect(() => {
    target.current = to;
  });
  useLayoutEffect(() => {
    if (!disabled) return;
    if (!had.current && document.activeElement !== ref.current) return;
    had.current = false;
    for (const el of target.current()) {
      if (!el || (el as HTMLButtonElement).disabled) continue;
      el.focus();
      if (document.activeElement === el) return;
    }
  }, [disabled, ref]);
  return {
    ref,
    onFocus: () => {
      had.current = true;
    },
    onBlur: () => {
      had.current = false;
    },
  };
}

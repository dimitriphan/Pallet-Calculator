import type { FlagLine } from '../manualFlags';
import { ERROR_BOX, NOTE_BOX } from './styles';

/** The flags of a carton or layout, broken limits in the error style, notes in the note style. */
export function FlagList({ lines, label }: { lines: readonly FlagLine[]; label: string }) {
  if (lines.length === 0) return null;
  return (
    // role="list" keeps list semantics in Safari, which drops them with list-style none.
    <ul role="list" aria-label={label} className="space-y-1.5">
      {lines.map((line) => (
        <li
          key={line.key}
          data-flag={line.key}
          data-tone={line.tone}
          className={line.tone === 'error' ? ERROR_BOX : NOTE_BOX}
        >
          {line.text}
        </li>
      ))}
    </ul>
  );
}

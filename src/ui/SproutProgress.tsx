const GREEN = '#7BCF80';

/**
 * The calculation progress line: a 1 px green line growing out of two small leaf tips at
 * unequal heights, drawn on whole pixels. It sweeps while shown (see `.sprout-line` in
 * index.css) and stands still when the user prefers reduced motion. In Light it sits on a slim
 * dark carrier so the green stays visible. Decorative: "Calculating…" beside it says it all.
 */
export function SproutProgress() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="96"
      height="8"
      viewBox="0 0 96 8"
      shapeRendering="crispEdges"
      className="sprout shrink-0"
    >
      <rect className="sprout-carrier dark:hidden" width="96" height="8" fill="#333333" />
      {/* Drawn from the leaves leftwards, so the sweep always grows out of the sprout. */}
      <path
        className="sprout-line"
        d="M91 5.5H2"
        pathLength={100}
        stroke={GREEN}
        strokeWidth={1}
        fill="none"
      />
      {/* A 2 px stem step with a 3 × 2 leaf on the left and a lower 2 × 2 leaf on the right. */}
      <path d="M90 3h1v2h-1zM87 2h3v2h-3zM92 3h2v2h-2z" fill={GREEN} />
    </svg>
  );
}

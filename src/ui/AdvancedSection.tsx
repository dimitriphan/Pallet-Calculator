/** Placeholder for the later Advanced Optimization release: shown, but it cannot be opened. */
export function AdvancedSection() {
  return (
    <details
      aria-disabled="true"
      className="border border-dashed border-gray-300 bg-gray-50 text-gray-500 dark:border-harbor-foam/40 dark:bg-harbor-panel dark:text-harbor-mist"
      onToggle={(e) => {
        if (e.currentTarget.open) e.currentTarget.open = false;
      }}
    >
      <summary
        className="focus-ticks flex cursor-not-allowed list-none items-center justify-between px-2 py-1.5 text-sm [&::-webkit-details-marker]:hidden"
        onClick={(e) => e.preventDefault()}
      >
        <span>Advanced optimization</span>
        <span className="text-xs">Coming in a later release</span>
      </summary>
    </details>
  );
}

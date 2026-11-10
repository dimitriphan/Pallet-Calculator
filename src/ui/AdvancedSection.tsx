/** Placeholder for the later Advanced Optimization release: shown, but it cannot be opened. */
export function AdvancedSection() {
  return (
    <details
      aria-disabled="true"
      className="rounded border border-dashed border-gray-300 bg-gray-50 text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400"
      onToggle={(e) => {
        if (e.currentTarget.open) e.currentTarget.open = false;
      }}
    >
      <summary
        className="flex cursor-not-allowed list-none items-center justify-between px-2 py-1.5 text-sm [&::-webkit-details-marker]:hidden"
        onClick={(e) => e.preventDefault()}
      >
        <span className="font-medium">Advanced optimization</span>
        <span className="text-xs">Coming in a later release</span>
      </summary>
    </details>
  );
}

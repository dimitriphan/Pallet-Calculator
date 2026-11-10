import type { ReactNode } from 'react';

/** A titled list of label/value rows used by the details tabs. */
export function DetailRows({ title, rows }: { title?: string; rows: [string, ReactNode][] }) {
  return (
    <section className="space-y-1">
      {title && <h3 className="text-xs heading text-gray-500 dark:text-harbor-mist">{title}</h3>}
      <dl className="bracket divide-y divide-gray-100 bg-white text-sm dark:divide-harbor-foam/40 dark:bg-harbor-panel">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 px-2 py-1">
            <dt className="text-gray-600 dark:text-harbor-mist">{label}</dt>
            <dd className="text-right tabular-nums text-gray-900 dark:text-harbor-foam">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

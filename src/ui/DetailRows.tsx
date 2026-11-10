import type { ReactNode } from 'react';

/** A titled list of label/value rows used by the details tabs. */
export function DetailRows({ title, rows }: { title?: string; rows: [string, ReactNode][] }) {
  return (
    <section className="space-y-1">
      {title && (
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      )}
      <dl className="divide-y divide-gray-100 rounded border border-gray-200 bg-white text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 px-2 py-1">
            <dt className="text-gray-600">{label}</dt>
            <dd className="text-right font-medium tabular-nums text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

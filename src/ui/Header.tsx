/** App name, with room on the right for the preset, scenario and export menus. */
export function Header() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
      <h1 className="text-base font-semibold tracking-tight text-gray-900">Pallet Calculator</h1>
      <div data-testid="header-actions" className="flex items-center gap-2" />
    </header>
  );
}

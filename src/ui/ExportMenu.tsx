import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { buildSheetContent, buildSheetFilename } from '../export/buildSheet';
import type { SheetPictures } from '../export/buildSheetPdf';
import { buildCsv } from '../export/csv';
import { downloadBlob } from '../export/download';
import { buildExportPayload, exportFilename } from '../export/exportData';
import { loadPrintMascot } from '../export/mascotImage';
import { composePng } from '../export/png';
import { useNoticesStore } from '../store/noticesStore';
import { BuildSheetDialog } from './BuildSheetDialog';
import { useUnit } from './useUnit';
import { BUTTON } from './ModalDialog';
import type { ViewMode } from '../store/prefsStore';
import { usePrefs, useResults, useScene } from './StoreContext';

type Format = 'pdf' | 'json' | 'csv' | 'png';

const BOTH: ViewMode[] = ['basic', 'full'];
const FULL_ONLY: ViewMode[] = ['full'];

/** The menu, in order; each item lists the view modes that offer it. */
const ITEMS: { format: Format; label: string; modes: ViewMode[] }[] = [
  { format: 'pdf', label: 'Build sheet (PDF)', modes: BOTH },
  { format: 'json', label: 'JSON', modes: FULL_ONLY },
  { format: 'csv', label: 'CSV', modes: FULL_ONLY },
  { format: 'png', label: 'PNG', modes: BOTH },
];

const NO_LAYOUT = 'Run a calculation first';
const NO_3D = '3D view is unavailable, so PNG export is disabled.';
const PNG_FAILED = 'PNG export failed. Try again after the 3D view has loaded.';
const PDF_FAILED = 'Build sheet could not be created. Try again.';

const ITEM =
  'focus-ticks-inset block w-full px-3 py-1.5 text-left text-sm text-gray-800 hover:bg-gray-100 focus:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-white dark:text-harbor-foam dark:hover:bg-harbor-raised dark:focus:bg-harbor-raised dark:disabled:text-harbor-mist dark:disabled:hover:bg-harbor-panel';

/**
 * Export of the selected layout as a PDF build sheet, JSON, CSV, or a three-view PNG
 * (Basic mode offers the build sheet and PNG).
 */
export function ExportMenu() {
  const inputs = useResults((s) => s.inputs);
  const result = useResults((s) => s.result);
  const selectedIndex = useResults((s) => s.selectedIndex);
  const stale = useResults((s) => s.stale);
  const captureViews = useScene((s) => s.captureViews);
  const viewMode = usePrefs((s) => s.viewMode);
  const unit = useUnit();
  const items = ITEMS.filter((item) => item.modes.includes(viewMode));
  const [open, setOpen] = useState(false);
  const [sheetDialog, setSheetDialog] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const hasLayout = !!inputs && !!result?.layouts[selectedIndex];
  const disabledFor = (f: Format) => !hasLayout || (f === 'png' && !captureViews);
  const titleFor = (f: Format) =>
    !hasLayout ? NO_LAYOUT : f === 'png' && !captureViews ? NO_3D : undefined;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const enabledItems = () =>
    Array.from(
      root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:enabled') ?? [],
    );

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  const openMenu = (focus: 'first' | 'last' = 'first') => {
    setOpen(true);
    // The items mount on the next render.
    queueMicrotask(() => {
      const items = enabledItems();
      (focus === 'first' ? items[0] : items.at(-1))?.focus();
    });
  };

  const onTriggerKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu(e.key === 'ArrowUp' ? 'last' : 'first');
    }
  };

  // On the wrapper, so Escape works from the trigger too (all items may be disabled).
  const onRootKeyDown = (e: KeyboardEvent) => {
    if (open && e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent) => {
    const items = enabledItems();
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      e.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at < 0 ? items.length - 1 : at - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(items.length - 1);
    else if (e.key === 'Tab') setOpen(false);
  };

  /** Light-rendered pictures for the build sheet, or null when the 3D view cannot give them. */
  const sheetPictures = (): SheetPictures | null => {
    try {
      if (!captureViews) return null;
      // The builders' pictures never show the unused-space overlay, even when it is on.
      const { current, side } = captureViews({ leaveOutUnusedSpace: true });
      return { current, side };
    } catch {
      return null;
    }
  };

  const saveBuildSheet = async (jobName: string) => {
    try {
      if (!inputs || !result) throw new Error('No layout');
      const now = new Date();
      const sheet = buildSheetContent({
        inputs,
        result,
        selectedIndex,
        jobName,
        stale,
        now,
        unit,
      });
      const { renderBuildSheetPdf } = await import('../export/buildSheetPdf');
      // The mascot is decoration: a failed load gives a sheet without it, not a failed export.
      const mascot = await loadPrintMascot().catch(() => undefined);
      downloadBlob(
        await renderBuildSheetPdf(sheet, sheetPictures(), mascot),
        buildSheetFilename(now),
      );
    } catch {
      useNoticesStore.getState().push(PDF_FAILED);
    }
    setSheetDialog(false);
  };

  const choose = async (format: Format) => {
    close(true);
    if (!inputs || !result) return;
    if (format === 'pdf') {
      setSheetDialog(true);
      return;
    }
    const now = new Date();
    const payload = buildExportPayload(inputs, result, selectedIndex, now, stale);
    const name = exportFilename(format, now);
    if (format === 'json') {
      downloadBlob(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
        name,
      );
    } else if (format === 'csv') {
      // The byte-order mark makes Excel read the file as UTF-8 (×, ³, –).
      downloadBlob(
        new Blob(['\uFEFF', buildCsv(payload, unit)], { type: 'text/csv;charset=utf-8' }),
        name,
      );
    } else {
      try {
        if (!captureViews) throw new Error('3D view is unavailable');
        downloadBlob(await composePng(captureViews(), payload, unit), name);
      } catch {
        useNoticesStore.getState().push(PNG_FAILED);
      }
    }
  };

  return (
    <div ref={root} className="relative" onKeyDown={onRootKeyDown}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={BUTTON}
      >
        Export
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Export"
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-20 mt-1 w-56 border border-gray-200 bg-white py-1 dark:border-harbor-foam dark:bg-harbor-panel"
        >
          {items.map(({ format, label }) => (
            <div key={format}>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={disabledFor(format)}
                title={titleFor(format)}
                onClick={() => void choose(format)}
                className={ITEM}
              >
                {label}
              </button>
              {format === 'png' && hasLayout && !captureViews && (
                <p className="px-3 pb-1.5 text-xs text-gray-600 dark:text-harbor-mist">{NO_3D}</p>
              )}
            </div>
          ))}
        </div>
      )}
      {sheetDialog && (
        <BuildSheetDialog onSave={saveBuildSheet} onCancel={() => setSheetDialog(false)} />
      )}
    </div>
  );
}

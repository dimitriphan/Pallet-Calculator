import { useId } from 'react';
import type { OrientationCode } from '../../domain/types';
import {
  canonicalFacing,
  designCarton,
  designedSize,
  sideDownChoices,
  type CartonSide,
  type SideDown,
} from '../../engine/manual/carton';
import { calculatedCartons, type EditorSession } from '../../store/manualEditorStore';
import { DetailRows } from '../DetailRows';
import { dimsText, fmtCount, fmtPct, lengthText, pairText, weightText } from '../format';
import { cartonBlockedText, cartonFlagList, flagLines } from '../manualFlags';
import { useManualEditor, useResults } from '../StoreContext';
import { useUnit } from '../useUnit';
import { CountStepper } from './CountStepper';
import { facingCaption, facingName } from './facing';
import { FacingPicture } from './FacingPicture';
import { FlagList } from './FlagList';
import { RadioCards, type RadioCard } from './RadioCards';
import { ERROR_BOX, HINT, SECTION_TITLE } from './styles';

const SIDES: { side: CartonSide; label: string; what: string }[] = [
  { side: 'length', label: 'Boxes along the length', what: "boxes along the carton's length" },
  { side: 'width', label: 'Boxes along the width', what: "boxes along the carton's width" },
  { side: 'height', label: 'Boxes along the height', what: "boxes along the carton's height" },
];

const SIDE_DOWN_LABEL: Record<SideDown, string> = {
  base: 'On its base',
  side: 'On its side',
  end: 'On its end',
};

export const KEPT_UPRIGHT_REASON = 'Keep cartons upright is on, so the carton stays on its base.';

/** How many calculated cartons "Use a calculated carton" offers. */
const CALCULATED_SHOWN = 5;

const countsText = (c: Record<CartonSide, number>) =>
  `${fmtCount(c.length)} × ${fmtCount(c.width)} × ${fmtCount(c.height)}`;

/**
 * The Carton step (spec 6.2a): how many boxes each way, which way they face, which side of the
 * carton is down, the figures that follow and what is wrong with the carton, if anything.
 */
export function CartonStep({ session }: { session: EditorSession }) {
  const unit = useUnit();
  const ids = useId();
  const setCount = useManualEditor((s) => s.setCount);
  const setFacing = useManualEditor((s) => s.setFacing);
  const setSideDown = useManualEditor((s) => s.setSideDown);
  const applyCalculatedCarton = useManualEditor((s) => s.applyCalculatedCarton);
  const result = useResults((s) => s.result);

  const { design, carton, inputs, figures, cartonFlags } = session;
  const lines = flagLines(cartonFlagList(cartonFlags), unit);
  const blocked = cartonBlockedText(cartonFlags, unit);
  // A blocked carton is said once, with what to do about it, not again in the list.
  const listed = lines.filter((l) => !(blocked && l.blocking));

  const rows: [string, string][] = [
    ['Boxes per carton', fmtCount(figures.boxesPerCarton)],
    ['Outer size', dimsText(figures.outer, unit)],
    ['Inner size', dimsText(figures.inner, unit)],
    ...(figures.weight === null
      ? []
      : ([['Carton weight', weightText(figures.weight, unit)]] as [string, string][])),
    ['Boxes fill', fmtPct(figures.fill * 100)],
  ];
  // Said politely to a screen reader after each change: the figures, then anything wrong.
  const spoken = [
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(blocked ? [blocked] : []),
    ...listed.map((l) => l.text),
  ].join('. ');

  const facing = canonicalFacing(design.facing, inputs.product);
  const facingOptions: RadioCard<OrientationCode>[] = session.facings.map((f) => ({
    value: f,
    label: facingName(f),
  }));

  const upright = inputs.keepCartonsUpright;
  const sideOptions: RadioCard<SideDown>[] = sideDownChoices(design, carton).map((c) => ({
    value: c.sideDown,
    label: SIDE_DOWN_LABEL[c.sideDown],
    detail: `${pairText(Math.max(c.base.a, c.base.b), Math.min(c.base.a, c.base.b), unit)} on the pallet, ${lengthText(c.height, unit)} high`,
    disabled: upright && c.sideDown !== 'base',
  }));

  const calculated = calculatedCartons(result).slice(0, CALCULATED_SHOWN);
  const designKey = JSON.stringify(design);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <DetailRows title="This carton" rows={rows} />
        {blocked && (
          <p data-flag="blocked" className={ERROR_BOX}>
            {blocked}
          </p>
        )}
        <FlagList lines={listed} label="Carton flags" />
        <p role="status" className="sr-only">
          {spoken}
        </p>
      </section>

      <section className="space-y-2" role="group" aria-labelledby={`${ids}counts`}>
        <h3 id={`${ids}counts`} className={SECTION_TITLE}>
          Boxes in the carton
        </h3>
        {SIDES.map(({ side, label, what }) => (
          <CountStepper
            key={side}
            label={label}
            what={what}
            value={design.counts[side]}
            onChange={(n) => setCount(side, n)}
          />
        ))}
      </section>

      <section className="space-y-2">
        <h3 id={`${ids}facing`} className={SECTION_TITLE}>
          Box facing
        </h3>
        <FacingChoice
          labelledBy={`${ids}facing`}
          describedBy={`${ids}facing-hint`}
          options={facingOptions}
          value={facing}
          onChange={setFacing}
          session={session}
        />
        <p id={`${ids}facing-hint`} className={HINT}>
          Every box in the carton faces the same way. The shaded face is the top of the box.
        </p>
      </section>

      <section className="space-y-2">
        <h3 id={`${ids}down`} className={SECTION_TITLE}>
          Carton on the pallet
        </h3>
        <RadioCards
          labelledBy={`${ids}down`}
          describedBy={upright ? `${ids}down-reason` : undefined}
          options={sideOptions}
          value={design.sideDown}
          onChange={setSideDown}
        />
        {upright && (
          <p id={`${ids}down-reason`} className={HINT}>
            {KEPT_UPRIGHT_REASON}
          </p>
        )}
      </section>

      {calculated.length > 0 && (
        <section className="space-y-2">
          <h3 id={`${ids}calculated`} className={SECTION_TITLE}>
            Use a calculated carton
          </h3>
          <ul role="list" aria-labelledby={`${ids}calculated`} className="space-y-1.5">
            {calculated.map((c) => {
              const inUse = JSON.stringify(c.design) === designKey;
              const outer = designedSize(c.design, designCarton(c.design, inputs), 'outer');
              return (
                <li key={c.index}>
                  <button
                    type="button"
                    aria-pressed={inUse}
                    onClick={() => applyCalculatedCarton(c.index)}
                    className={`focus-ticks flex min-h-[44px] w-full flex-col items-start justify-center border px-2.5 py-1.5 text-left text-sm ${
                      inUse
                        ? 'border-blue-700 bg-blue-50 text-blue-950 dark:border-harbor-foam dark:border-l-[3px] dark:border-l-harbor-green dark:bg-harbor-raised dark:text-harbor-foam'
                        : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-harbor-foam dark:bg-harbor-raised dark:text-harbor-foam dark:hover:bg-harbor-raised dark:hover:underline'
                    }`}
                  >
                    <span>
                      {fmtCount(c.carton.boxesPerCarton)}{' '}
                      {c.carton.boxesPerCarton === 1 ? 'box' : 'boxes'} (
                      {countsText(c.design.counts)})
                    </span>
                    <span className="text-xs tabular-nums">{dimsText(outer, unit)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className={HINT}>Boxes along the carton&apos;s length × width × height.</p>
        </section>
      )}
    </div>
  );
}

interface FacingChoiceProps {
  labelledBy: string;
  describedBy: string;
  options: readonly RadioCard<OrientationCode>[];
  value: OrientationCode;
  onChange(value: OrientationCode): void;
  session: EditorSession;
}

/** The facings as picture buttons: the same radio group, each choice drawn. */
function FacingChoice({ options, session, ...rest }: FacingChoiceProps) {
  const pictured = options.map((o) => {
    const caption = facingCaption(o.value);
    return {
      ...o,
      label: caption.upright,
      detail: (
        <>
          <span className="block">{caption.turn}</span>
          <FacingPicture facing={o.value} product={session.inputs.product} />
        </>
      ),
      ariaLabel: facingName(o.value),
    };
  });
  return <RadioCards {...rest} options={pictured} layout="grid grid-cols-3 gap-1.5" />;
}

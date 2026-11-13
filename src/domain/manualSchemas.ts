/**
 * The stored form of a manual layout (spec 6.5): what the user chose and the inputs its carton
 * was made for; nothing that is worked out. Lengths in inches.
 */
import { z } from 'zod';
import type { ManualLayoutSpec } from '../engine/manual/build';

const count = z.number().int().min(1);
const size = z.number().gt(0).finite();
const position = z.number().finite();
const nonNegative = z.number().min(0).finite();

/** More cartons than any layer can hold; a longer list is damaged data. */
export const MAX_STORED_CARTONS = 10000;

export const manualLayoutSpecSchema: z.ZodType<ManualLayoutSpec> = z.object({
  id: z.string().min(1),
  name: z.string(),
  design: z.object({
    counts: z.object({ length: count, width: count, height: count }),
    facing: z.enum(['LWH', 'LHW', 'WLH', 'WHL', 'HLW', 'HWL']),
    sideDown: z.enum(['base', 'side', 'end']),
  }),
  cartons: z
    .array(z.object({ x: position, y: position, rotated: z.boolean() }))
    .max(MAX_STORED_CARTONS),
  // Absent in data stored before positions were kept in the pallet frame (see build.ts).
  frame: z.literal('pallet').optional(),
  upperLayers: z.enum(['same', 'alternate']),
  madeFor: z.object({
    product: z.object({ length: size, width: size, height: size }),
    wallThickness: nonNegative,
    leeway: nonNegative,
    outer: z.object({ L: size, W: size, H: size }),
  }),
});

/**
 * A list of stored manual layouts in which an entry that cannot be read is dropped on its own,
 * so one damaged layout never takes the others (or the scenario holding them) with it.
 */
export const manualLayoutListSchema: z.ZodType<ManualLayoutSpec[], unknown[]> = z
  .array(z.unknown())
  .transform((items) =>
    items.flatMap((item) => {
      const parsed = manualLayoutSpecSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  );

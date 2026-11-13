import { describe, expect, it } from 'vitest';
import { manualLayoutSpecSchema } from '../domain/manualSchemas';
import { bestCartonsFor, isValidSpec, madeForOf } from '../engine/manual/build';
import { designCarton, designOf, type CartonDesign } from '../engine/manual/carton';
import { overlapCount, type ManualCarton } from '../engine/manual/layer';
import { calculatedCartons, HISTORY_LIMIT, type EditorSession } from './manualEditorStore';
import { manualStores } from './manualTestSupport';

/** A 2 x 2 x 1 carton of the default 12 x 8 x 4 box: 25 x 17 x 5 outside. */
const DESIGN: CartonDesign = {
  counts: { length: 2, width: 2, height: 1 },
  facing: 'LWH',
  sideDown: 'base',
};
/** Four of them fill 50 x 34 of the default 50 x 42 pallet, centred: 4 in free front and back. */
const FOUR: ManualCarton[] = [
  { x: 0, y: 4, rotated: false },
  { x: 25, y: 4, rotated: false },
  { x: 0, y: 21, rotated: false },
  { x: 25, y: 21, rotated: false },
];

async function setup() {
  const t = manualStores();
  await t.calculate();
  const e = () => t.manualEditor.getState();
  const s = (): EditorSession => {
    const session = e().session;
    if (!session) throw new Error('No session');
    return session;
  };
  /** Saves a manual layout of DESIGN with these cartons and opens it at the layer step. */
  const openLayer = (cartons: ManualCarton[] = FOUR) => {
    const spec = t.manualLayouts.getState().save({
      design: DESIGN,
      cartons,
      frame: 'pallet',
      upperLayers: 'same',
      madeFor: madeForOf(DESIGN, t.current()),
    });
    expect(e().openSaved(spec!.id)).toEqual({ ok: true });
    return spec;
  };
  return { ...t, e, s, openLayer, m: () => t.manualLayouts.getState() };
}

describe('opening', () => {
  it('has no session at first, and every action is refused without one', async () => {
    const { e } = await setup();
    expect(e().session).toBeNull();
    const no = { ok: false, reason: 'noSession' };
    expect(e().setCount('length', 2)).toEqual(no);
    expect(e().setFacing('LWH')).toEqual(no);
    expect(e().setSideDown('side')).toEqual(no);
    expect(e().applyCalculatedCarton(0)).toEqual(no);
    expect(e().setUpperLayers('same')).toEqual(no);
    expect(e().goToStep('layer')).toEqual(no);
    expect(e().select(0)).toEqual(no);
    expect(e().move(0, { x: 0, y: 0 })).toEqual(no);
    expect(e().nudge(1, 0)).toEqual(no);
    expect(e().turn()).toEqual(no);
    expect(e().add()).toEqual(no);
    expect(e().remove()).toEqual(no);
    expect(e().reset()).toEqual(no);
    expect(e().undo()).toEqual(no);
    expect(e().redo()).toEqual(no);
    expect(e().save()).toEqual(no);
    expect(e().saveAsNew()).toEqual(no);
    expect(e().previewMove(0, { x: 0, y: 0 })).toBeNull();
    e().cancel();
    e().setName('x');
    e().setSnapping(false);
    expect(e().session).toBeNull();
  });

  it('opens a copy of any calculated layout at the layer step: same boxes, layers and rating', async () => {
    const { e, s, results } = await setup();
    const layouts = results.getState().result!.layouts;
    expect(layouts.length).toBeGreaterThan(1);
    layouts.forEach((ranked, index) => {
      expect(e().openFromCalculated(index)).toEqual({ ok: true });
      const { layout } = ranked;
      expect(s().origin).toEqual({ kind: 'calculated', layoutId: layout.id });
      expect(s().step).toBe('layer');
      expect(s().name).toBe('Manual 1');
      expect(s().carton).toEqual(layout.carton);
      expect(s().cartons).toHaveLength(layout.layers[0]!.cartonCount);
      expect(s().layer).toBe(s().cartons);
      expect(overlapCount(s().cartons, s().base)).toBe(0);
      expect(s()).toMatchObject({
        dirty: false,
        canUndo: false,
        canRedo: false,
        layerEdited: false,
        layerPending: false,
        selected: null,
        snapping: true,
        canSave: true,
      });
      // A layout whose layers all repeat its bottom layer is copied exactly.
      const oneType = layout.layers.every((l) => l.cartonCount === layout.layers[0]!.cartonCount);
      if (oneType && layout.layers.every((l) => l.vertical === layout.layers[0]!.vertical)) {
        expect(s().build.layout.totalProducts).toBe(layout.totalProducts);
        expect(s().build.layout.layers).toHaveLength(layout.layers.length);
        expect(s().build.layout.stability?.rating).toBe(layout.stability?.rating);
      }
      expect(s().build.status).toBe('current');
      expect(s().build.flags.filter((f) => f.kind !== 'orientationNotAllowed')).toEqual([]);
      expect(s().upperLayers).toBe(layout.layers.some((l) => l.turned) ? 'alternate' : 'same');
    });
    // The result itself is never changed.
    expect(results.getState().result!.layouts).toBe(layouts);
    expect(e().openFromCalculated(99)).toEqual({ ok: false, reason: 'notFound' });
    expect(e().openFromCalculated(0, 'carton')).toEqual({ ok: true });
    expect(s().step).toBe('carton');
  });

  it('"design my own" starts from the best result at the carton step', async () => {
    const { e, s, results } = await setup();
    const best = results.getState().result!.layouts[0]!.layout;
    expect(e().openOwn()).toEqual({ ok: true });
    expect(s().origin).toEqual({ kind: 'own' });
    expect(s().step).toBe('carton');
    expect(s().design).toEqual(designOf(best.carton, best.layers[0]!.vertical));
    expect(s().carton).toEqual(best.carton);
  });

  it('is refused with nothing calculated', () => {
    const t = manualStores();
    expect(t.manualEditor.getState().openOwn()).toEqual({ ok: false, reason: 'noInputs' });
    expect(t.manualEditor.getState().openFromCalculated(0)).toEqual({
      ok: false,
      reason: 'noInputs',
    });
  });

  it('opens a saved layout to save over it; an out-of-date one can only be rebuilt', async () => {
    const t = await setup();
    const spec = t.openLayer();
    expect(t.s()).toMatchObject({
      origin: { kind: 'saved', id: spec!.id },
      name: 'Manual 1',
      step: 'layer',
      cartons: FOUR,
      design: DESIGN,
      upperLayers: 'same',
      dirty: false,
      // A saved manual layer is the user's own.
      layerEdited: true,
    });
    expect(t.s().build.layout.id).toBe(`manual:${spec!.id}`);
    expect(t.e().openSaved('nope')).toEqual({ ok: false, reason: 'notFound' });
    expect(t.e().rebuild('nope')).toEqual({ ok: false, reason: 'notFound' });
    t.e().cancel();

    t.change({ product: { ...t.current().product, length: 13 } });
    await t.calculate();
    expect(t.e().openSaved(spec!.id)).toEqual({ ok: false, reason: 'outOfDate' });
    expect(t.e().session).toBeNull();
    expect(t.e().rebuild(spec!.id)).toEqual({ ok: true });
    const best = t.results.getState().result!.layouts[0]!.layout;
    expect(t.s()).toMatchObject({
      origin: { kind: 'saved', id: spec!.id },
      name: 'Manual 1',
      step: 'carton',
      layerEdited: false,
    });
    expect(t.s().carton).toEqual(best.carton);
    const saved = t.e().save();
    expect(saved).toEqual({ ok: true, id: spec!.id });
    expect(t.m().specs).toHaveLength(1);
    expect(t.m().entries[0]!.build.status).toBe('current');
  });
});

describe('carton step', () => {
  async function carton() {
    const t = await setup();
    t.openLayer();
    expect(t.e().goToStep('carton')).toEqual({ ok: true });
    return t;
  }

  it('shows the live carton, figures and facings', async () => {
    const t = await carton();
    expect(t.s().carton).toEqual(designCarton(DESIGN, t.current()));
    expect(t.s().figures).toEqual({
      boxesPerCarton: 4,
      inner: { length: 24.5, width: 16.5, height: 4.5 },
      outer: { length: 25, width: 17, height: 5 },
      weight: null,
      fill: (4 * 12 * 8 * 4) / (25 * 17 * 5),
    });
    expect(t.s().base).toEqual({ a: 25, b: 17 });
    expect(t.s().usable).toEqual({ x: 50, y: 42 });
    expect(t.s().pallet).toEqual({ x: 0, y: 0, w: 50, h: 42 });
    expect(t.s().facings).toHaveLength(6);
    // 25 long against the default 24 maximum: flagged at once, not blocked.
    expect(t.s().cartonFlags).toMatchObject({
      overMaximum: [{ side: 'longest', size: 25, max: 24, by: 1 }],
      blocked: null,
    });

    t.change({ weights: { productBox: 2, maxPallet: null, emptyCarton: 1, pallet: 40 } });
    expect(t.s().figures.weight).toBe(9);
    t.change({ product: { length: 8, width: 8, height: 8 } });
    expect(t.s().facings).toEqual(['LWH']);
  });

  it('setCount, setFacing and setSideDown change the design, each undoable', async () => {
    const t = await carton();
    expect(t.e().setCount('height', 3)).toEqual({ ok: true });
    expect(t.s().design.counts).toEqual({ length: 2, width: 2, height: 3 });
    expect(t.s().figures.boxesPerCarton).toBe(12);
    expect(t.s().figures.outer.height).toBe(13);
    expect(t.s().dirty).toBe(true);

    expect(t.e().setFacing('WLH')).toEqual({ ok: true });
    expect(t.s().figures.outer).toEqual({ length: 17, width: 25, height: 13 });
    expect(t.e().setSideDown('side')).toEqual({ ok: true });
    expect(t.s().base).toEqual({ a: 17, b: 13 });
    expect(t.s().build.layout.layers[0]!.height).toBe(25);

    expect(t.e().undo()).toEqual({ ok: true });
    expect(t.s().design.sideDown).toBe('base');
    expect(t.e().undo()).toEqual({ ok: true });
    expect(t.e().undo()).toEqual({ ok: true });
    expect(t.s().design).toEqual(DESIGN);
    expect(t.s()).toMatchObject({ dirty: false, canUndo: false, canRedo: true });
    expect(t.e().undo()).toEqual({ ok: false, reason: 'nothingToUndo' });
    expect(t.e().redo()).toEqual({ ok: true });
    expect(t.s().design.counts.height).toBe(3);
  });

  it('refuses counts below 1 or not whole, unknown facings and sides', async () => {
    const t = await carton();
    const bad = { ok: false, reason: 'invalid' };
    for (const n of [0, -1, 1.5, NaN, Infinity]) expect(t.e().setCount('width', n)).toEqual(bad);
    expect(t.e().setCount('depth' as 'width', 2)).toEqual(bad);
    expect(t.e().setFacing('XYZ' as 'LWH')).toEqual(bad);
    expect(t.e().setSideDown('top' as 'base')).toEqual(bad);
    expect(t.e().setUpperLayers('spiral' as 'same')).toEqual(bad);
    expect(t.s()).toMatchObject({ design: DESIGN, canUndo: false });
    // Setting what is already set is not a change.
    expect(t.e().setCount('width', 2)).toEqual({ ok: true });
    expect(t.e().setFacing('LWH')).toEqual({ ok: true });
    expect(t.s().canUndo).toBe(false);
  });

  it('keeps the carton on its base while "Keep cartons upright" is on', async () => {
    const t = await carton();
    t.inputs.getState().setKeepCartonsUpright(true);
    expect(t.s().inputs.keepCartonsUpright).toBe(true);
    expect(t.e().setSideDown('end')).toEqual({ ok: false, reason: 'cartonsKeptUpright' });
    expect(t.e().setSideDown('base')).toEqual({ ok: true });
    t.inputs.getState().setKeepCartonsUpright(false);
    expect(t.e().setSideDown('end')).toEqual({ ok: true });
  });

  it('flags a carton over the maximum size at once, and still lets it through', async () => {
    const t = await carton();
    t.e().setCount('length', 3);
    expect(t.s().cartonFlags.overMaximum).toEqual([{ side: 'longest', size: 37, max: 24, by: 13 }]);
    expect(t.s().build.flags).toContainEqual({
      kind: 'overMaximum',
      sides: t.s().cartonFlags.overMaximum,
    });
    expect(t.s().canSave).toBe(true);
    expect(t.e().goToStep('layer', { replace: true })).toEqual({ ok: true });
  });

  it('a carton that cannot fit the footprint or is too tall cannot go on or be saved', async () => {
    const t = await carton();
    t.e().setCount('length', 5);
    expect(t.s().cartonFlags.blocked).toBe('footprint');
    expect(t.e().goToStep('layer', { replace: true })).toEqual({
      ok: false,
      reason: 'cartonBlocked',
      blocked: 'footprint',
    });
    expect(t.s().step).toBe('carton');
    expect(t.s().canSave).toBe(false);
    const refused = t.e().save({ replace: true });
    expect(refused).toMatchObject({ ok: false, reason: 'cannotSave' });
    expect(refused.ok === false && refused.reason === 'cannotSave' && refused.flags).toContainEqual(
      { kind: 'cannotFit' },
    );
    expect(t.e().session).not.toBeNull();

    t.e().setCount('length', 2);
    t.e().setCount('height', 20);
    expect(t.e().goToStep('layer')).toEqual({
      ok: false,
      reason: 'cartonBlocked',
      blocked: 'height',
    });
    expect(t.e().save()).toMatchObject({ ok: false, reason: 'cannotSave' });
  });

  it('offers the calculated cartons, each once, and takes one', async () => {
    const t = await carton();
    const result = t.results.getState().result!;
    const offered = calculatedCartons(result);
    expect(calculatedCartons(null)).toEqual([]);
    expect(offered.length).toBeGreaterThan(0);
    expect(new Set(offered.map((c) => JSON.stringify(c.design))).size).toBe(offered.length);
    expect(offered[0]!.index).toBe(0);
    for (const c of offered) {
      expect(designCarton(c.design, t.current())).toEqual(c.carton);
      expect(result.layouts[c.index]!.layout.carton).toBe(c.carton);
    }
    const pick = offered.at(-1)!;
    expect(t.e().applyCalculatedCarton(pick.index)).toEqual({ ok: true });
    expect(t.s().design).toEqual(pick.design);
    expect(t.s().carton).toEqual(pick.carton);
    expect(t.e().applyCalculatedCarton(99)).toEqual({ ok: false, reason: 'notFound' });
    t.e().undo();
    expect(t.s().design).toEqual(DESIGN);
  });
});

describe('from the carton step to the layer step', () => {
  it('a carton change loads the best layer for the carton when the layer was not hand-edited', async () => {
    const t = await setup();
    t.e().openFromCalculated(0, 'carton');
    const before = t.s().cartons;
    t.e().setCount('length', 1);
    t.e().setCount('width', 1);
    t.e().setFacing('LWH');
    const design = t.s().design;
    expect(t.s().layerPending).toBe(true);
    // Until then the working layer is the old one; what is built is the new carton's best.
    expect(t.s().cartons).toBe(before);
    const best = bestCartonsFor(design, t.current());
    expect(t.s().layer).toEqual(best);
    expect(t.s().build.layout.layers[0]!.cartonCount).toBe(best.length);

    expect(t.e().goToStep('layer')).toEqual({ ok: true });
    expect(t.s()).toMatchObject({ step: 'layer', layerPending: false, layerEdited: false });
    expect(t.s().cartons).toEqual(best);
    expect(overlapCount(t.s().cartons, t.s().base)).toBe(0);
    // Reset now goes back to the loaded layer.
    t.e().remove(0);
    t.e().reset();
    expect(t.s().cartons).toEqual(best);
  });

  it('applies the layer pattern setting to the layer it loads', async () => {
    const t = await setup();
    t.inputs.getState().setLayerPattern('pinwheelOnly');
    await t.calculate();
    t.e().openOwn();
    t.e().setCount('height', t.s().design.counts.height);
    t.e().setFacing('LWH');
    t.e().setCount('length', 1);
    t.e().setCount('width', 1);
    expect(t.s().layer).toEqual(bestCartonsFor(t.s().design, t.current()));
    expect(t.current().layerPattern).toBe('pinwheelOnly');
  });

  it('asks before replacing a hand-edited layer, and undo brings it back', async () => {
    const t = await setup();
    t.openLayer();
    t.e().remove(3);
    const edited = t.s().cartons;
    expect(t.s().layerEdited).toBe(true);
    t.e().goToStep('carton');
    t.e().setCount('length', 1);
    expect(t.s().layerPending).toBe(true);

    expect(t.e().goToStep('layer')).toEqual({ ok: false, reason: 'layerEdited' });
    expect(t.s()).toMatchObject({ step: 'carton', cartons: edited });
    // Saving from here would replace it too, so that asks as well.
    expect(t.e().save()).toEqual({ ok: false, reason: 'layerEdited' });
    expect(t.e().session).not.toBeNull();

    expect(t.e().goToStep('layer', { replace: true })).toEqual({ ok: true });
    const best = bestCartonsFor(t.s().design, t.current());
    expect(t.s()).toMatchObject({ step: 'layer', layerEdited: false, layerPending: false });
    expect(t.s().cartons).toEqual(best);

    // One undo: the carton change is undone and the hand-edited layer is back.
    expect(t.e().undo()).toEqual({ ok: true });
    expect(t.s().design).toEqual(DESIGN);
    expect(t.s().cartons).toEqual(edited);
    expect(t.s()).toMatchObject({ layerEdited: true, layerPending: false, step: 'layer' });
    // Redo: the changed carton with its loaded layer.
    expect(t.e().redo()).toEqual({ ok: true });
    expect(t.s().cartons).toEqual(best);
    expect(t.s().step).toBe('layer');
  });

  it('keeps the layer when the change leaves the carton base as it was', async () => {
    const t = await setup();
    t.openLayer();
    t.e().remove(3);
    const edited = t.s().cartons;
    t.e().goToStep('carton');
    t.e().setCount('height', 2);
    expect(t.s()).toMatchObject({ layerPending: false, layerEdited: true });
    expect(t.s().layer).toBe(edited);
    expect(t.e().goToStep('layer')).toEqual({ ok: true });
    expect(t.s().cartons).toBe(edited);
    // And changing it back again after a change that did move the base asks nothing.
    t.e().goToStep('carton');
    t.e().setCount('length', 1);
    t.e().setCount('length', 2);
    expect(t.s().layerPending).toBe(false);
    expect(t.e().goToStep('layer')).toEqual({ ok: true });
    expect(t.s().cartons).toBe(edited);
  });

  it('never shows the layer step with a layer of another carton: undo there goes back to the carton step', async () => {
    const t = await setup();
    t.e().openFromCalculated(0, 'carton');
    t.e().setCount('length', 1);
    t.e().setFacing(t.s().design.facing === 'LWH' ? 'WLH' : 'LWH');
    t.e().goToStep('layer');
    expect(t.s().step).toBe('layer');
    t.e().undo();
    // The carton after the first change, with the layer still the original carton's.
    expect(t.s()).toMatchObject({ layerPending: true, step: 'carton' });
    const no = { ok: false, reason: 'notOnLayerStep' };
    expect(t.e().add()).toEqual(no);
    expect(t.e().move(0, { x: 0, y: 0 })).toEqual(no);
    expect(t.e().turn(0)).toEqual(no);
    expect(t.e().remove(0)).toEqual(no);
    expect(t.e().nudge(1, 0)).toEqual(no);
    expect(t.e().select(0)).toEqual(no);
    expect(t.e().reset()).toEqual(no);
    expect(t.e().previewMove(0, { x: 0, y: 0 })).toBeNull();
  });

  it('saving straight from the carton step saves the best layer for the new carton', async () => {
    const t = await setup();
    t.e().openOwn();
    t.e().setFacing('LWH');
    t.e().setCount('length', 1);
    t.e().setCount('width', 1);
    t.e().setCount('height', 1);
    const design = t.s().design;
    const saved = t.e().save();
    expect(saved.ok).toBe(true);
    const spec = t.m().specs[0]!;
    expect(spec.design).toEqual(design);
    expect(spec.cartons).toEqual(bestCartonsFor(design, t.current()));
    expect(spec.madeFor).toEqual(madeForOf(design, t.current()));
    expect(t.m().entries[0]!.build.flags.filter((f) => f.kind === 'overlap')).toEqual([]);
  });
});

describe('layer step', () => {
  it('selects a carton', async () => {
    const t = await setup();
    t.openLayer();
    expect(t.e().select(2)).toEqual({ ok: true });
    expect(t.s().selected).toBe(2);
    expect(t.e().select(9)).toEqual({ ok: false, reason: 'noSelection' });
    expect(t.e().select(null)).toEqual({ ok: true });
    expect(t.s()).toMatchObject({ selected: null, canUndo: false, dirty: false });
  });

  it('builds the layout again only when it changed: not for a selection, a preview or a name', async () => {
    const t = await setup();
    t.openLayer();
    const build = t.s().build;
    t.e().select(0);
    t.e().previewMove(0, { x: 0, y: 3 });
    t.e().setName('Another name');
    t.e().setSnapping(false);
    expect(t.s().build).toBe(build);
    expect(t.e().nudge(0, -0.25)).toMatchObject({ ok: true });
    expect(t.s().build).not.toBe(build);
    expect(t.s().build.layout.layers[0]?.blocks[0]).toMatchObject({ x: 0, y: 3.75 });
  });

  it('moves a carton, snapping to edges within 0.5 in when snapping is on', async () => {
    const t = await setup();
    t.openLayer(FOUR.slice(0, 1));
    expect(t.e().previewMove(0, { x: 0.3, y: 24.8 })).toEqual({
      position: { x: 0, y: 25 },
      valid: true,
    });
    expect(t.s().cartons).toEqual(FOUR.slice(0, 1));
    expect(t.e().move(0, { x: 0.3, y: 24.8 })).toEqual({ ok: true, position: { x: 0, y: 25 } });
    expect(t.s().cartons).toEqual([{ x: 0, y: 25, rotated: false }]);
    expect(t.s()).toMatchObject({ layerEdited: true, dirty: true, canUndo: true });

    t.e().setSnapping(false);
    expect(t.s().snapping).toBe(false);
    expect(t.e().move(0, { x: 0.3, y: 24.8 })).toEqual({ ok: true, position: { x: 0.3, y: 24.8 } });
    // A typed position is exact whatever the toggle says, and a drag can force either.
    t.e().setSnapping(true);
    expect(t.e().move(0, { x: 10.2, y: 0.4 }, { snap: false })).toMatchObject({
      position: { x: 10.2, y: 0.4 },
    });
    expect(t.e().move(0, { x: 10.2, y: 0.4 }, { snap: true })).toMatchObject({
      position: { x: 10.2, y: 0 },
    });
    expect(t.e().move(0, { x: NaN, y: 0 })).toEqual({ ok: false, reason: 'invalid' });
    expect(t.e().move(5, { x: 0, y: 0 })).toEqual({ ok: false, reason: 'noSelection' });
  });

  it('snaps to the edges of other cartons and to the pallet inside an overhang', async () => {
    const t = await setup();
    t.change({ overhang: 2 });
    // Saved relative to the pallet; the session works in the footprint, 1 in further out.
    t.openLayer([
      { x: 0, y: 0, rotated: false },
      { x: 25.4, y: 19, rotated: false },
    ]);
    expect(t.s().pallet).toEqual({ x: 1, y: 1, w: 50, h: 42 });
    expect(t.s().cartons).toEqual([
      { x: 1, y: 1, rotated: false },
      { x: 26.4, y: 20, rotated: false },
    ]);
    // Its left edge onto the first carton's right edge (x = 26), its top onto that one's top.
    expect(t.e().move(1, { x: 26.3, y: 1.2 })).toEqual({ ok: true, position: { x: 26, y: 1 } });
    // Onto the footprint edge when that is nearer than the pallet edge.
    expect(t.e().move(1, { x: 26, y: 0.3 })).toEqual({ ok: true, position: { x: 26, y: 0 } });
  });

  it('refuses a move that would overlap and leaves the carton where it was', async () => {
    const t = await setup();
    t.openLayer();
    expect(t.e().previewMove(0, { x: 10, y: 10 })).toEqual({
      position: { x: 10, y: 10 },
      valid: false,
    });
    expect(t.e().move(0, { x: 10, y: 10 })).toEqual({ ok: false, reason: 'overlap' });
    expect(t.s()).toMatchObject({ cartons: FOUR, canUndo: false, dirty: false });
    // Reaching outside the usable footprint is allowed, and flagged.
    expect(t.e().move(0, { x: -20, y: 4 }, { snap: false })).toMatchObject({ ok: true });
    expect(t.s().build.flags).toContainEqual({ kind: 'overhang', cartons: 1, by: 20 });
    expect(t.s().canSave).toBe(true);
    // Dropping a carton where it already is changes nothing.
    const depth = t.s().cartons;
    expect(t.e().move(1, { x: 25, y: 4 })).toEqual({ ok: true, position: { x: 25, y: 4 } });
    expect(t.s().cartons).toBe(depth);
  });

  it('keeps a carton at least partly on the pallet, however it is moved', async () => {
    const t = await setup();
    t.openLayer();
    const { a } = t.s().base;
    // Wholly off the footprint (its right edge on the footprint's left edge, or beyond).
    for (const to of [
      { x: -a, y: 4 },
      { x: -a - 5, y: 4 },
      { x: 4, y: 500 },
    ]) {
      expect(t.e().previewMove(0, to)?.valid, JSON.stringify(to)).toBe(false);
      expect(t.e().move(0, to, { snap: false })).toEqual({ ok: false, reason: 'offPallet' });
    }
    expect(t.s()).toMatchObject({ cartons: FOUR, canUndo: false, dirty: false });
    // A quarter inch of it on the pallet is enough; from there a nudge further is refused.
    expect(t.e().move(0, { x: 0.25 - a, y: 4 }, { snap: false })).toMatchObject({ ok: true });
    t.e().select(0);
    expect(t.e().nudge(-0.25, 0)).toEqual({ ok: false, reason: 'offPallet' });
    expect(t.e().nudge(-1, 0)).toEqual({ ok: false, reason: 'offPallet' });
    expect(t.s().cartons[0]).toEqual({ x: 0.25 - a, y: 4, rotated: false });
    expect(t.e().nudge(0.25, 0)).toMatchObject({ ok: true });
  });

  it('opens a stored layout with a carton wholly off the pallet, which can be brought back', async () => {
    const t = await setup();
    t.openLayer([{ x: -80, y: 4, rotated: false }, FOUR[1]!]);
    expect(t.s().build.flags).toContainEqual(expect.objectContaining({ kind: 'overhang' }));
    t.e().select(0);
    expect(t.e().nudge(-1, 0)).toEqual({ ok: false, reason: 'offPallet' });
    expect(t.e().nudge(1, 0)).toEqual({ ok: true, position: { x: -79, y: 4 } });
    expect(t.e().previewMove(0, { x: -70, y: 4 })?.valid).toBe(true);
    expect(t.e().move(0, { x: 0, y: 4 }, { snap: false })).toMatchObject({ ok: true });
  });

  it('nudges the selected carton exactly, without snapping', async () => {
    const t = await setup();
    t.openLayer();
    expect(t.e().nudge(0, -0.25)).toEqual({ ok: false, reason: 'noSelection' });
    t.e().select(0);
    expect(t.e().nudge(0, -0.25)).toEqual({ ok: true, position: { x: 0, y: 3.75 } });
    expect(t.e().nudge(0, -1)).toEqual({ ok: true, position: { x: 0, y: 2.75 } });
    expect(t.e().nudge(0.25, 0)).toEqual({ ok: false, reason: 'overlap' });
    expect(t.e().nudge(NaN, 0)).toEqual({ ok: false, reason: 'invalid' });
    expect(t.e().nudge(0, Infinity)).toEqual({ ok: false, reason: 'invalid' });
    expect(t.s().cartons[0]).toEqual({ x: 0, y: 2.75, rotated: false });
    expect(t.s().selected).toBe(0);
    t.e().undo();
    expect(t.s().cartons[0]).toEqual({ x: 0, y: 3.75, rotated: false });
  });

  it('turns the selected carton, or refuses when it would overlap wherever it is put', async () => {
    const t = await setup();
    t.openLayer([{ x: 0, y: 0, rotated: false }]);
    expect(t.e().turn()).toEqual({ ok: false, reason: 'noSelection' });
    t.e().select(0);
    expect(t.e().turn()).toEqual({ ok: true });
    expect(t.s().cartons).toEqual([{ x: 0, y: 0, rotated: true }]);
    expect(t.e().turn(0)).toEqual({ ok: true });
    expect(t.s().cartons).toEqual([{ x: 0, y: 0, rotated: false }]);
    t.e().cancel();

    // Boxed in front and behind: turned, it is 25 deep and overlaps one of them at every place.
    const boxed = [
      { x: 0, y: 0, rotated: false },
      { x: 0, y: 17, rotated: false },
      { x: 0, y: -17, rotated: false },
    ];
    t.openLayer(boxed);
    expect(t.e().turn(0)).toEqual({ ok: false, reason: 'turnRefused' });
    expect(t.s()).toMatchObject({ cartons: boxed, canUndo: false });
    expect(t.e().turn(7)).toEqual({ ok: false, reason: 'noSelection' });
  });

  it('adds a carton at the first free spot, the way the last carton touched lies', async () => {
    const t = await setup();
    t.openLayer(FOUR.slice(0, 3));
    const added = t.e().add();
    expect(added).toEqual({ ok: true, index: 3 });
    // Front-left first: the front is the greatest y.
    expect(t.s().cartons[3]).toEqual({ x: 25, y: 25, rotated: false });
    expect(t.s().selected).toBe(3);
    expect(t.e().add()).toEqual({ ok: false, reason: 'noFreeSpot' });
    expect(t.s().cartons).toHaveLength(4);
    expect(overlapCount(t.s().cartons, t.s().base)).toBe(0);

    t.e().cancel();
    t.openLayer([{ x: 0, y: 0, rotated: true }]);
    t.e().select(0);
    t.e().add();
    expect(t.s().cartons[1]!.rotated).toBe(true);
    t.e().turn(1);
    t.e().add();
    expect(t.s().cartons[2]!.rotated).toBe(false);
  });

  it('adds the other way round when only that fits', async () => {
    const t = await setup();
    // 20 in of free width at the right: only a turned carton (17 wide) fits.
    t.change({ pallet: { length: 45, width: 25, height: 72 } });
    t.openLayer([{ x: 0, y: 0, rotated: false }]);
    expect(t.e().add()).toEqual({ ok: true, index: 1 });
    expect(t.s().cartons[1]).toEqual({ x: 25, y: 0, rotated: true });
    expect(t.e().add()).toEqual({ ok: false, reason: 'noFreeSpot' });
  });

  it('removes the selected carton; the selection follows the cartons left', async () => {
    const t = await setup();
    t.openLayer();
    expect(t.e().remove()).toEqual({ ok: false, reason: 'noSelection' });
    t.e().select(2);
    expect(t.e().remove(0)).toEqual({ ok: true });
    expect(t.s().selected).toBe(1);
    expect(t.s().cartons).toEqual(FOUR.slice(1));
    expect(t.e().remove()).toEqual({ ok: true });
    expect(t.s()).toMatchObject({ selected: null, cartons: [FOUR[1], FOUR[3]] });
    expect(t.e().remove(5)).toEqual({ ok: false, reason: 'noSelection' });
    t.e().remove(0);
    t.e().remove(0);
    // An empty layer cannot be saved.
    expect(t.s().build.flags).toContainEqual({ kind: 'empty' });
    expect(t.s().canSave).toBe(false);
    expect(t.e().save()).toMatchObject({ ok: false, reason: 'cannotSave' });
  });

  it('reset goes back to the layer it started from, and can be undone', async () => {
    const t = await setup();
    t.openLayer();
    expect(t.e().reset()).toEqual({ ok: true });
    expect(t.s().canUndo).toBe(false);
    // Whether there is anything to reset: the layer differs from the one it started as.
    expect(t.s().layerChanged).toBe(false);
    t.e().select(1);
    expect(t.s().layerChanged).toBe(false);
    t.e().remove(0);
    expect(t.s().layerChanged).toBe(true);
    t.e().select(0);
    t.e().nudge(0, -1);
    const edited = t.s().cartons;
    expect(t.e().reset()).toEqual({ ok: true });
    expect(t.s()).toMatchObject({
      cartons: FOUR,
      selected: null,
      dirty: false,
      layerChanged: false,
    });
    t.e().undo();
    expect(t.s().cartons).toBe(edited);
    expect(t.s().layerChanged).toBe(true);
    // Moved away and back by hand: nothing to reset again.
    t.e().undo();
    t.e().undo();
    expect(t.s().layerChanged).toBe(false);
  });

  it('the bar figures follow the layer: cartons, layers, boxes, weight, rating and flags', async () => {
    const t = await setup();
    t.change({ weights: { productBox: 2, maxPallet: null, emptyCarton: 1, pallet: 40 } });
    t.openLayer();
    const full = t.s().build.layout;
    expect(full.layers[0]!.cartonCount).toBe(4);
    expect(full.layers).toHaveLength(13);
    expect(full.totalProducts).toBe(4 * 13 * 4);
    expect(full.stability?.rating).toBeDefined();
    t.e().remove(0);
    expect(t.s().build.layout.totalProducts).toBe(3 * 13 * 4);
    expect(t.s().build.layout.layers[0]!.kind).toBe('manual');

    expect(t.e().setUpperLayers('alternate')).toEqual({ ok: true });
    expect(t.s().build.layout.layers[1]!.turned).toBe(true);
    expect(t.s()).toMatchObject({ upperLayers: 'alternate', dirty: true });
    t.e().undo();
    expect(t.s().upperLayers).toBe('same');
    expect(t.s().build.layout.layers[1]!.turned).toBeUndefined();

    // Re-checked as the inputs change, like a saved layout.
    t.change({ weights: { productBox: 2, maxPallet: 60, emptyCarton: 1, pallet: 40 } });
    expect(t.s().build.flags).toContainEqual({ kind: 'overWeight', by: 7 });
    expect(t.s().build.layout.layers).toHaveLength(1);
    t.change({ pallet: { length: 40, width: 42, height: 72 } });
    expect(t.s().usable).toEqual({ x: 40, y: 42 });
    expect(t.s().build.flags).toContainEqual(expect.objectContaining({ kind: 'overhang' }));
  });

  it('keeps the session through invalid inputs and re-checks when they are valid again', async () => {
    const t = await setup();
    t.openLayer();
    const before = t.s();
    t.inputs.getState().setField('pallet.height', '');
    // Nothing is re-checked; the session only says it is on the last valid inputs.
    expect(t.s()).toEqual({ ...before, usingLastValid: true });
    t.inputs.getState().setField('pallet.height', '20');
    expect(t.s().usingLastValid).toBe(false);
    expect(t.s().build.layout.layers).toHaveLength(3);
    expect(t.s().cartons).toBe(before.cartons);
  });
});

describe('undo and redo', () => {
  it('step back and forward over every change, in order', async () => {
    const t = await setup();
    t.openLayer();
    const states: string[] = [];
    const snap = () => JSON.stringify([t.s().design, t.s().cartons, t.s().upperLayers]);
    const did = (r: { ok: boolean }) => {
      expect(r.ok).toBe(true);
      states.push(snap());
    };
    states.push(snap());
    did(t.e().remove(3));
    did(t.e().move(0, { x: 0, y: 0 }));
    did(t.e().turn(2));
    did(t.e().add());
    did(t.e().setUpperLayers('alternate'));
    did(t.e().goToStep('carton'));
    states.pop();
    did(t.e().setCount('height', 2));
    did(t.e().goToStep('layer'));
    states.pop();
    did(t.e().nudge(0, 0.5));
    did(t.e().reset());

    for (let k = states.length - 2; k >= 0; k--) {
      expect(t.e().undo()).toEqual({ ok: true });
      expect(snap()).toBe(states[k]);
    }
    expect(t.s()).toMatchObject({ canUndo: false, canRedo: true, dirty: false });
    for (let k = 1; k < states.length; k++) {
      expect(t.e().redo()).toEqual({ ok: true });
      expect(snap()).toBe(states[k]);
    }
    expect(t.e().redo()).toEqual({ ok: false, reason: 'nothingToRedo' });
    // A new change after an undo drops what could be redone.
    t.e().undo();
    t.e().remove(0);
    expect(t.s().canRedo).toBe(false);
  });

  it('a refused action leaves nothing to undo', async () => {
    const t = await setup();
    t.openLayer();
    t.e().move(0, { x: 10, y: 10 });
    t.e().add();
    t.e().setCount('length', 0);
    expect(t.s().canUndo).toBe(false);
  });

  it('keeps a bounded history', async () => {
    const t = await setup();
    t.openLayer(FOUR.slice(0, 1));
    t.e().select(0);
    t.e().setSnapping(false);
    for (let k = 0; k < HISTORY_LIMIT + 20; k++) t.e().nudge(0.01, 0);
    let undone = 0;
    while (t.e().undo().ok) undone++;
    expect(undone).toBe(HISTORY_LIMIT);
  });
});

describe('save, save as new, cancel', () => {
  it('saves a copy of a calculated layout as a new manual layout, selects it and closes', async () => {
    const t = await setup();
    t.results.getState().select(1);
    t.e().openFromCalculated(1);
    const { design, cartons, upperLayers } = t.s();
    const saved = t.e().save();
    expect(saved.ok).toBe(true);
    expect(t.e().session).toBeNull();
    const spec = t.m().specs[0]!;
    expect(saved).toEqual({ ok: true, id: spec.id });
    expect(spec).toEqual({
      id: spec.id,
      name: 'Manual 1',
      design,
      cartons,
      frame: 'pallet',
      upperLayers,
      madeFor: madeForOf(design, t.current()),
    });
    expect(t.results.getState().selectedManualId).toBe(spec.id);
    // The calculated layouts are as they were.
    expect(t.results.getState().result!.layouts[1]!.layout.id).not.toContain('manual:');

    t.e().openFromCalculated(0);
    t.e().setName('Top shelf');
    expect(t.s().name).toBe('Top shelf');
    t.e().save();
    t.e().openFromCalculated(0);
    expect(t.s().name).toBe('Manual 2');
    t.e().save({ name: 'Given' });
    expect(t.m().specs.map((s) => s.name)).toEqual(['Manual 1', 'Top shelf', 'Given']);
  });

  it('editing a saved layout saves over it, or as new under the next default name', async () => {
    const t = await setup();
    const spec = t.openLayer();
    t.e().remove(3);
    expect(t.e().save()).toEqual({ ok: true, id: spec!.id });
    expect(t.m().specs).toHaveLength(1);
    expect(t.m().specs[0]).toMatchObject({ id: spec!.id, name: 'Manual 1' });
    expect(t.m().specs[0]!.cartons).toEqual(FOUR.slice(0, 3));

    t.e().openSaved(spec!.id);
    t.e().remove(2);
    const copy = t.e().saveAsNew();
    expect(copy.ok).toBe(true);
    expect(t.m().specs.map((s) => [s.name, s.cartons.length])).toEqual([
      ['Manual 1', 3],
      ['Manual 2', 2],
    ]);
    expect(t.results.getState().selectedManualId).toBe(t.m().specs[1]!.id);

    t.e().openSaved(spec!.id);
    t.e().save({ name: 'Renamed' });
    expect(t.m().specs[0]!.name).toBe('Renamed');
    // Saved over a layout deleted meanwhile: it is saved as a new one.
    t.e().openSaved(spec!.id);
    t.m().remove(spec!.id);
    const again = t.e().save();
    expect(again.ok && again.id !== spec!.id).toBe(true);
    expect(t.m().specs.map((s) => s.name)).toEqual(['Manual 2', 'Renamed']);
  });

  it('never saves a spec the engine would refuse', async () => {
    const t = await setup();
    t.openLayer();
    t.e().setCount('length', 1.5);
    t.e().setCount('width', 0);
    t.e().setFacing('ZZZ' as 'LWH');
    t.e().move(0, { x: Infinity, y: 0 });
    t.e().move(1, { x: 0, y: NaN }, { snap: false });
    t.e().select(0);
    t.e().nudge(NaN, NaN);
    expect(isValidSpec({ ...t.m().specs[0]!, design: t.s().design, cartons: t.s().layer })).toBe(
      true,
    );
    expect(t.s().canUndo).toBe(false);
    t.e().saveAsNew();
    for (const spec of t.m().specs) {
      expect(isValidSpec(spec)).toBe(true);
      expect(manualLayoutSpecSchema.safeParse(spec).success).toBe(true);
    }
  });

  it('cancel discards the session and saves nothing', async () => {
    const t = await setup();
    const spec = t.openLayer();
    t.e().remove(0);
    expect(t.s().dirty).toBe(true);
    t.e().cancel();
    expect(t.e().session).toBeNull();
    expect(t.m().specs).toEqual([spec]);
    // The snapping choice is kept for the next session; undo history is not.
    t.e().openSaved(spec!.id);
    t.e().setSnapping(false);
    t.e().remove(0);
    t.e().cancel();
    t.e().openFromCalculated(0);
    expect(t.s()).toMatchObject({ snapping: false, canUndo: false, dirty: false });
  });
});

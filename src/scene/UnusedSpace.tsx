import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, type InstancedMesh } from 'three';
import type { Inputs, Layout } from '../domain/types';
import { unusedSpace, type SpaceBox } from '../engine/analytics/unusedSpace';
import { HIDE_IN_BUILD_SHEET } from './captureVisibility';
import type { FixedSceneColors } from './sceneTheme';
import { boxEdgePositions, instanceMatrices } from './transforms';

/**
 * Inches taken off every block (half on each side) so its faces and edges sit just inside
 * the cartons' faces and edges they touch, with no z-fighting.
 */
const SHRINK = 0.08;

/** Drawn after the cartons and the envelope, so the translucent red reads the same everywhere. */
const RENDER_ORDER = 2;

/** The edge lines: stronger than the faces so each block's outline reads, lighter than solid. */
const EDGE_OPACITY = 0.6;

/** Never hit by the pointer: clicks go through to the cartons behind. */
const noRaycast = () => undefined;

function shrunk(b: SpaceBox): SpaceBox {
  const s = SHRINK / 2;
  return {
    x: b.x + s,
    y: b.y + s,
    z: b.z + s,
    dx: b.dx - SHRINK,
    dy: b.dy - SHRINK,
    dz: b.dz - SHRINK,
  };
}

/**
 * The unused space of the layout as translucent red blocks with thin edges: the headroom above
 * the stack and the gaps beside the cartons in every layer. One InstancedMesh and one line set
 * whatever the number of blocks. Not selectable; left out of the build sheet's pictures.
 */
export function UnusedSpace({
  layout,
  inputs,
  colors,
}: {
  layout: Layout;
  inputs: Inputs;
  colors: FixedSceneColors;
}) {
  const boxes = useMemo(() => {
    const u = unusedSpace(layout, inputs);
    return [...u.gaps, ...(u.headroom ? [u.headroom] : [])].map(shrunk);
  }, [layout, inputs]);
  const edges = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(boxEdgePositions(boxes, inputs), 3));
    return g;
  }, [boxes, inputs]);
  useEffect(() => () => edges.dispose(), [edges]);

  if (boxes.length === 0) return null;
  return (
    <group userData={{ [HIDE_IN_BUILD_SHEET]: true }}>
      <Blocks key={boxes.length} boxes={boxes} inputs={inputs} colors={colors} />
      <lineSegments geometry={edges} raycast={noRaycast} renderOrder={RENDER_ORDER}>
        <lineBasicMaterial
          color={colors.unusedSpace}
          transparent
          opacity={EDGE_OPACITY}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}

/** The blocks as one InstancedMesh, reallocated (by key) when their number changes. */
function Blocks({
  boxes,
  inputs,
  colors,
}: {
  boxes: SpaceBox[];
  inputs: Inputs;
  colors: FixedSceneColors;
}) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceMatrix.array.set(instanceMatrices(boxes, inputs));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [boxes, inputs, invalidate]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, boxes.length]}
      raycast={noRaycast}
      renderOrder={RENDER_ORDER}
    >
      <boxGeometry />
      <meshBasicMaterial
        color={colors.unusedSpace}
        transparent
        opacity={colors.unusedSpaceOpacity}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

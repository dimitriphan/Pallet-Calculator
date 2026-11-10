export const WEBGL_UNAVAILABLE =
  '3D view is unavailable in this browser. All numbers above remain accurate.';

let cached: boolean | null = null;

/** Whether this browser can create a WebGL context; checked once, then remembered. */
export function webglAvailable(): boolean {
  if (cached !== null) return cached;
  cached = false;
  if (typeof window === 'undefined' || typeof WebGLRenderingContext === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    cached = gl !== null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}

// The mascot pixel maps are a plain .mjs build tool; tests read them for sprite checks.
declare module '*/tools/mascot/poses.mjs' {
  export const POSES: Record<string, readonly string[]>;
}

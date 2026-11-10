// The mascot pixel maps are a plain .mjs build tool; tests read them for sprite checks.
declare module '*/tools/mascot/poses.mjs' {
  type Pose = readonly string[];
  export const POSES: {
    idle: Pose;
    working1: Pose;
    working2: Pose;
    working3: Pose;
    concerned: Pose;
    headerMark: Pose;
    print: Pose;
  };
}

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * Catches errors thrown while rendering the 3D view (a failed chunk load, a failed WebGL
 * context creation, or any render error in the scene or its toolbar) and shows the fallback
 * instead, so the rest of the workspace stays mounted. Key it to reset.
 */
export class SceneErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[3D scene]', error, info.componentStack);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

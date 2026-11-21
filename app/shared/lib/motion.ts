/**
 * The four motion behaviours DESIGN §4.5 allows beyond the existing controls: a theme
 * cross-fade, a keyed tab-panel enter, slider feedback and a 1 px card lift. Everything is
 * 120–200 ms, colour/opacity/transform only, and instant under reduced motion.
 */
export interface MotionEnv {
  document?: { startViewTransition?: (callback: () => void) => unknown };
  matchMedia?: (query: string) => { matches: boolean } | null;
}

export function prefersReducedMotion(env: MotionEnv): boolean {
  return env.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

/**
 * Runs `callback` inside the View Transition API when it exists, otherwise applies it
 * immediately. Returns whether a transition actually ran. Reduced motion always wins.
 */
export function runViewTransition(callback: () => void, env: MotionEnv): boolean {
  if (prefersReducedMotion(env) || typeof env.document?.startViewTransition !== 'function') {
    callback();
    return false;
  }
  env.document.startViewTransition(callback);
  return true;
}

/** Slider feedback: the thumb scales on press, the track colours change; no position transition. */
export const SLIDER_MOTION_UI = {
  thumb: 'transition-transform duration-[120ms] active:scale-110 motion-reduce:transform-none',
  track: 'transition-colors duration-[120ms]',
} as const;

/** The keyed tab-panel wrapper class; the animation lives in `main.css`. */
export const PANEL_ENTER_CLASS = 'sz-panel-enter';

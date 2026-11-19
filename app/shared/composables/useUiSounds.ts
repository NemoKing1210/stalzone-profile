import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_STORAGE_KEY,
  classifySoundTarget,
  isActivationKey,
  parseSoundSettings,
  serializeSoundSettings,
  type SoundSettings,
  type SoundTarget,
  type UiSoundKind,
} from '../lib/uiSounds';

/**
 * Interface click sounds, synthesised with Web Audio: no audio files, no network.
 * The plugin attaches the global listeners; the settings screen reuses the same
 * shared state through `useState`.
 */

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'summary',
  'select',
  'input',
  'textarea',
  'label',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
].join(',');

/** Fast repeated presses share one click instead of stacking noise. */
const MIN_INTERVAL = 0.03;

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let lastPlayedAt = 0;
let attached = false;

function ensureGraph(): { context: AudioContext; master: GainNode } | null {
  if (!import.meta.client) return null;
  if (context && master) return { context, master };

  const Ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!Ctor) return null;

  try {
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);

    const frames = Math.ceil(context.sampleRate * 0.06);
    noiseBuffer = context.createBuffer(1, frames, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;

    return { context, master };
  } catch {
    context = null;
    master = null;
    noiseBuffer = null;
    return null;
  }
}

/** One mechanical tick: a short metallic noise burst with a low body underneath. */
function tick(ctx: AudioContext, output: GainNode, when: number, level: number, pitch: number): void {
  if (!noiseBuffer) return;

  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = pitch;
  band.Q.value = 0.8;

  const click = ctx.createGain();
  click.gain.setValueAtTime(0.0001, when);
  click.gain.exponentialRampToValueAtTime(level, when + 0.003);
  click.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);

  source.connect(band).connect(click).connect(output);
  source.start(when);
  source.stop(when + 0.06);

  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(170, when);
  body.frequency.exponentialRampToValueAtTime(80, when + 0.05);

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.0001, when);
  bodyGain.gain.exponentialRampToValueAtTime(level * 0.5, when + 0.005);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.055);

  body.connect(bodyGain).connect(output);
  body.start(when);
  body.stop(when + 0.06);
}

/** A soft low thud: the sound of an item being set down. */
function thud(ctx: AudioContext, output: GainNode, when: number, level: number): void {
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(230, when);
  body.frequency.exponentialRampToValueAtTime(85, when + 0.13);

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.0001, when);
  bodyGain.gain.exponentialRampToValueAtTime(level, when + 0.008);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.17);

  body.connect(bodyGain).connect(output);
  body.start(when);
  body.stop(when + 0.18);
}

/** Shared guard: a disabled setting, an absent graph or a repeated press plays nothing. */
function begin(settings: SoundSettings): { context: AudioContext; master: GainNode; now: number } | null {
  if (!import.meta.client || !settings.enabled) return null;

  const graph = ensureGraph();
  if (!graph) return null;
  if (graph.context.state === 'suspended') void graph.context.resume().catch(() => {});

  const now = graph.context.currentTime;
  if (now - lastPlayedAt < MIN_INTERVAL) return null;
  lastPlayedAt = now;

  graph.master.gain.value = settings.volume * 0.35;
  return { context: graph.context, master: graph.master, now };
}

function playSound(kind: UiSoundKind, settings: SoundSettings): void {
  const graph = begin(settings);
  if (!graph) return;
  const { context: ctx, master: output, now } = graph;

  if (kind === 'toggle') {
    tick(ctx, output, now, 0.5, 2600);
    tick(ctx, output, now + 0.055, 0.35, 3000);
    return;
  }
  tick(ctx, output, now, 0.7, 2100);
}

/**
 * The placement sound: a dull knock and one low thud, deliberately unlike the control
 * click so a drop is audible without looking at the grid.
 */
function playPlace(settings: SoundSettings): void {
  const graph = begin(settings);
  if (!graph) return;
  const { context: ctx, master: output, now } = graph;

  tick(ctx, output, now, 0.28, 1000);
  thud(ctx, output, now + 0.01, 0.5);
}

function describeTarget(node: EventTarget | null): SoundTarget | null {
  if (!(node instanceof Element)) return null;

  const element = node.closest(INTERACTIVE_SELECTOR);
  if (!element) return null;

  const type = element.getAttribute('type') ?? (element instanceof HTMLInputElement ? element.type : null);

  return {
    tagName: element.tagName,
    role: element.getAttribute('role'),
    type,
    disabled: element.hasAttribute('disabled') || element.matches(':disabled'),
    ariaDisabled: element.getAttribute('aria-disabled') === 'true',
    muted: element.closest('[data-no-ui-sounds]') !== null,
  };
}

export function useUiSounds() {
  const settings = useState<SoundSettings>('uiSounds', () => ({ ...DEFAULT_SOUND_SETTINGS }));

  /** Reads the stored choice after hydration; the SSR markup keeps the defaults. */
  function load(): void {
    if (!import.meta.client) return;
    try {
      settings.value = parseSoundSettings(localStorage.getItem(SOUND_STORAGE_KEY));
    } catch {
      settings.value = { ...DEFAULT_SOUND_SETTINGS };
    }
  }

  function persist(): void {
    if (!import.meta.client) return;
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, serializeSoundSettings(settings.value));
    } catch {
      /* storage can be blocked in private mode; the choice still applies for this page */
    }
  }

  function play(kind: UiSoundKind): void {
    playSound(kind, settings.value);
  }

  /** The inventory placement thud; shares the enabled flag and the volume. */
  function place(): void {
    playPlace(settings.value);
  }

  function setEnabled(enabled: boolean): void {
    settings.value = { ...settings.value, enabled };
    persist();
    if (enabled) play('tap');
  }

  function setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    settings.value = { ...settings.value, volume: Math.min(1, Math.max(0, volume)) };
    persist();
  }

  function onPointerDown(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) return;
    playSoundFromTarget(event.target);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;

    const target = describeTarget(event.target);
    if (!target || !isActivationKey({ key: event.key, ...target })) return;
    playSoundFromTarget(event.target);
  }

  function playSoundFromTarget(node: EventTarget | null): void {
    const target = describeTarget(node);
    if (!target) return;
    const kind = classifySoundTarget(target);
    if (kind) playSound(kind, settings.value);
  }

  /** Adds the delegated listeners once and returns a detach function. */
  function attach(): () => void {
    if (!import.meta.client || attached) return () => {};

    attached = true;
    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    document.addEventListener('keydown', onKeyDown, { capture: true });

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, { capture: true });
      document.removeEventListener('keydown', onKeyDown, { capture: true });
      attached = false;
    };
  }

  return { settings, load, play, place, setEnabled, setVolume, attach };
}

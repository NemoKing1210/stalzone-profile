<script setup lang="ts">
import {
  DEFAULT_VOLUME,
  durationFromMetadata,
  formatClock,
  nextTrackIndex,
  parseRadioState,
  prevTrackIndex,
  spectrumLevels,
} from '../model/player';
import { RADIO_TRACKS } from '../model/tracks';

type RadioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

const STORAGE_KEY = 'dossier.radio';
const METER_BARS = 16;
const METER_BUFFER_SIZE = 128;

const { t } = useI18n();

const audioEl = ref<HTMLAudioElement | null>(null);
const trackIndex = ref(0);
const volume = ref(DEFAULT_VOLUME);
const muted = ref(false);
const expanded = ref(false);
const status = ref<RadioStatus>('idle');
const currentTime = ref(0);
const duration = ref<number | null>(null);
const levels = ref<number[]>(new Array(METER_BARS).fill(0));

const currentTrack = computed(() => RADIO_TRACKS[trackIndex.value]!);
const playIcon = computed(() =>
  status.value === 'loading'
    ? 'i-lucide-loader-circle'
    : status.value === 'playing'
      ? 'i-lucide-pause'
      : 'i-lucide-play',
);
const volumePercent = computed(() => Math.round(volume.value * 100));
const progress = computed(() => {
  const total = duration.value;
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, (currentTime.value / total) * 100));
});
const durationLabel = computed(() => formatClock(duration.value ?? Number.NaN));
const timeLabel = computed(() => `${formatClock(currentTime.value)} / ${durationLabel.value}`);

let context: AudioContext | null = null;
let gain: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let meterFrame = 0;
let lastMeterAt = 0;
const meterBuffer = new Uint8Array(METER_BUFFER_SIZE);

function readStored(): string | null {
  if (!import.meta.client) return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function persist(): void {
  if (!import.meta.client) return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        trackId: currentTrack.value.id,
        volume: volume.value,
        expanded: expanded.value,
      }),
    );
  } catch {
    /* storage can be blocked in private mode; the choice still applies for this page */
  }
}

async function expand(): Promise<void> {
  expanded.value = true;
  await nextTick();
  document.getElementById('zone-radio-player')?.querySelector<HTMLElement>('button')?.focus();
}

async function collapse(): Promise<void> {
  expanded.value = false;
  await nextTick();
  document.getElementById('zone-radio-open')?.focus();
}

function applyVolume(): void {
  const level = muted.value ? 0 : volume.value;
  if (gain) {
    gain.gain.value = level;
    return;
  }
  const audio = audioEl.value;
  if (!audio) return;
  audio.volume = level;
  audio.muted = muted.value;
}

function ensureGraph(): void {
  if (context || !audioEl.value) return;
  try {
    context = new AudioContext();
    const source = context.createMediaElementSource(audioEl.value);
    gain = context.createGain();
    analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(gain).connect(analyser).connect(context.destination);
    /* The element carried the fallback level before the graph existed; only the gain owns it now. */
    audioEl.value.volume = 1;
    audioEl.value.muted = false;
    applyVolume();
  } catch {
    context = null;
    gain = null;
    analyser = null;
  }
}

async function play(): Promise<void> {
  const audio = audioEl.value;
  if (!audio) return;

  status.value = 'loading';
  ensureGraph();
  try {
    if (context) await context.resume();
    await audio.play();
  } catch (error) {
    /* Pausing or switching while loading aborts the pending play(); that is not a failure. */
    if ((error as DOMException | undefined)?.name === 'AbortError') return;
    status.value = 'error';
    stopMeter();
  }
}

function pause(): void {
  audioEl.value?.pause();
  /* Also cancels a pending load; the aborted play() promise is ignored as AbortError. */
  if (status.value !== 'error') status.value = 'paused';
}

async function togglePlayback(): Promise<void> {
  if (status.value === 'playing' || status.value === 'loading') {
    pause();
    return;
  }
  await play();
}

async function selectTrack(index: number): Promise<void> {
  if (index === trackIndex.value) return;

  const wasPlaying = status.value === 'playing' || status.value === 'loading';
  trackIndex.value = index;
  currentTime.value = 0;
  duration.value = null;
  if (!wasPlaying) return;

  await nextTick();
  audioEl.value?.load();
  await play();
}

async function step(delta: -1 | 1): Promise<void> {
  const length = RADIO_TRACKS.length;
  const index = delta === 1 ? nextTrackIndex(trackIndex.value, length) : prevTrackIndex(trackIndex.value, length);
  await selectTrack(index);
}

function setVolumePercent(value: number | undefined): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  volume.value = Math.min(100, Math.max(0, value)) / 100;
  if (volume.value > 0) muted.value = false;
  applyVolume();
}

function toggleMute(): void {
  muted.value = !muted.value;
  if (!muted.value && volume.value === 0) volume.value = DEFAULT_VOLUME;
  applyVolume();
}

function onLoadedMetadata(): void {
  duration.value = durationFromMetadata(audioEl.value?.duration ?? Number.NaN);
}

function onTimeUpdate(): void {
  currentTime.value = audioEl.value?.currentTime ?? 0;
}

function onPlaying(): void {
  status.value = 'playing';
  syncMediaSession();
  startMeter();
}

function onPause(): void {
  if (status.value !== 'error') status.value = 'paused';
  stopMeter();
}

function onError(): void {
  status.value = 'error';
  duration.value = null;
  stopMeter();
}

function startMeter(): void {
  if (meterFrame || !import.meta.client) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tick = (now: number): void => {
    meterFrame = requestAnimationFrame(tick);
    if (!analyser) return;
    if (reduced && now - lastMeterAt < 250) return;
    lastMeterAt = now;
    analyser.getByteFrequencyData(meterBuffer);
    levels.value = spectrumLevels(meterBuffer, METER_BARS);
  };
  meterFrame = requestAnimationFrame(tick);
}

function stopMeter(): void {
  if (meterFrame) cancelAnimationFrame(meterFrame);
  meterFrame = 0;
  levels.value = new Array(METER_BARS).fill(0);
}

function syncMediaSession(): void {
  if (!import.meta.client || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.value.title,
      artist: currentTrack.value.author,
      album: t('radio.station'),
    });
    navigator.mediaSession.setActionHandler('play', () => {
      void play();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      pause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      void step(-1);
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      void step(1);
    });
  } catch {
    /* Media Session is optional; the bar keeps working without it. */
  }
}

watch([trackIndex, volume, expanded], persist);
watch(currentTrack, syncMediaSession);

onMounted(() => {
  const saved = parseRadioState(
    readStored(),
    RADIO_TRACKS.map((track) => track.id),
  );
  const index = RADIO_TRACKS.findIndex((track) => track.id === saved.trackId);
  trackIndex.value = index >= 0 ? index : 0;
  volume.value = saved.volume;
  expanded.value = saved.expanded;
  applyVolume();
  syncMediaSession();
});

onBeforeUnmount(() => {
  stopMeter();
  audioEl.value?.pause();
  context?.close().catch(() => {});
  context = null;
});
</script>

<template>
  <audio
    ref="audioEl"
    :src="currentTrack.src"
    preload="none"
    loop
    class="hidden"
    @loadedmetadata="onLoadedMetadata"
    @timeupdate="onTimeUpdate"
    @playing="onPlaying"
    @pause="onPause"
    @error="onError"
  />

  <Transition name="radio-bar">
    <section
      v-if="expanded"
      id="zone-radio-player"
      class="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--sz-border)] bg-ink-950 pb-[env(safe-area-inset-bottom)]"
      :aria-label="t('radio.region')"
    >
      <div class="mx-auto flex h-14 max-w-[1600px] items-center gap-1 px-2 sm:h-16 sm:gap-3 sm:px-4">
        <UButton
          :icon="playIcon"
          :aria-label="status === 'playing' || status === 'loading' ? t('radio.pause') : t('radio.play')"
          color="neutral"
          variant="ghost"
          square
          class="h-11 w-11 shrink-0 justify-center sm:h-9 sm:w-9"
          :ui="{ leadingIcon: status === 'loading' ? 'animate-spin' : undefined }"
          @click="togglePlayback"
        />
        <UButton
          icon="i-lucide-skip-back"
          :aria-label="t('radio.previous')"
          color="neutral"
          variant="ghost"
          square
          class="h-11 w-11 shrink-0 justify-center sm:h-9 sm:w-9"
          @click="step(-1)"
        />
        <UButton
          icon="i-lucide-skip-forward"
          :aria-label="t('radio.next')"
          color="neutral"
          variant="ghost"
          square
          class="h-11 w-11 shrink-0 justify-center sm:h-9 sm:w-9"
          @click="step(1)"
        />

        <div class="min-w-0 flex-1">
          <div
            class="flex items-center gap-2 overflow-hidden text-[10px] uppercase tracking-[0.14em] text-[var(--sz-text-dim)]"
          >
            <span class="shrink-0 text-[var(--sz-accent)]">{{ t('radio.station') }}</span>
            <span v-if="status === 'playing'" class="flex shrink-0 items-center gap-1 text-[var(--sz-success-text)]">
              <span class="inline-block size-1 rounded-full bg-[var(--sz-success-text)]" aria-hidden="true" />
              {{ t('radio.onAir') }}
            </span>
            <span v-else-if="status === 'loading'" class="truncate text-[var(--sz-text-muted)]">
              {{ t('radio.loading') }}
            </span>
            <span v-else-if="status === 'error'" class="truncate text-[var(--sz-danger-text)]">
              {{ t('radio.error') }}
            </span>
          </div>
          <div class="truncate text-[12.5px] text-[var(--sz-text)]" aria-live="polite">
            {{ currentTrack.title }}
          </div>
          <div class="hidden items-center gap-2 sm:flex">
            <span class="shrink-0 font-mono text-[10.5px] tabular-nums text-[var(--sz-text-muted)]">
              {{ timeLabel }}
            </span>
            <div
              class="h-0.5 min-w-0 flex-1 bg-[var(--sz-border)]"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="Math.round(progress)"
              :aria-valuetext="timeLabel"
            >
              <div class="h-full bg-[var(--sz-accent)]" :style="{ width: `${progress}%` }" />
            </div>
          </div>
        </div>

        <div class="hidden h-4 items-end gap-0.5 sm:flex" aria-hidden="true">
          <span
            v-for="(level, index) in levels"
            :key="index"
            class="w-0.5 bg-[var(--sz-accent)]"
            :style="{ height: `${2 + level * 14}px` }"
          />
        </div>

        <div class="hidden items-center gap-2 sm:flex">
          <UButton
            :icon="muted || volume === 0 ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
            :aria-label="muted || volume === 0 ? t('radio.unmute') : t('radio.mute')"
            color="neutral"
            variant="ghost"
            square
            class="h-9 w-9 justify-center"
            @click="toggleMute"
          />
          <USlider
            class="w-24"
            :model-value="volumePercent"
            :aria-label="t('radio.volume')"
            :aria-valuetext="`${volumePercent}%`"
            @update:model-value="setVolumePercent"
          />
        </div>

        <div class="sm:hidden">
          <UPopover>
            <UButton
              :icon="muted || volume === 0 ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
              :aria-label="t('radio.volume')"
              color="neutral"
              variant="ghost"
              square
              class="h-11 w-11 shrink-0 justify-center"
            />
            <template #content>
              <div class="flex w-52 items-center gap-3 p-3">
                <UButton
                  :icon="muted ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
                  :aria-label="muted ? t('radio.unmute') : t('radio.mute')"
                  color="neutral"
                  variant="ghost"
                  square
                  class="h-9 w-9 justify-center"
                  @click="toggleMute"
                />
                <USlider
                  class="flex-1"
                  :model-value="volumePercent"
                  :aria-label="t('radio.volume')"
                  :aria-valuetext="`${volumePercent}%`"
                  @update:model-value="setVolumePercent"
                />
              </div>
            </template>
          </UPopover>
        </div>

        <UPopover>
          <UButton
            icon="i-lucide-list-music"
            :aria-label="t('radio.tracks')"
            color="neutral"
            variant="ghost"
            square
            class="h-11 w-11 shrink-0 justify-center sm:h-9 sm:w-9"
          />
          <template #content>
            <div class="w-64 p-2">
              <div
                class="flex items-baseline justify-between gap-2 px-1 pb-2 text-[10px] uppercase tracking-[0.14em] text-[var(--sz-text-dim)]"
              >
                <span>{{ t('radio.tracks') }}</span>
                <span>{{ t('radio.position', { index: trackIndex + 1, count: RADIO_TRACKS.length }) }}</span>
              </div>
              <UButton
                v-for="(track, index) in RADIO_TRACKS"
                :key="track.id"
                block
                color="neutral"
                variant="ghost"
                class="justify-start border-l-2 px-2 py-2 text-left"
                :class="
                  index === trackIndex ? 'border-[var(--sz-accent)] text-[var(--sz-accent)]' : 'border-transparent'
                "
                :aria-current="index === trackIndex ? 'true' : undefined"
                @click="selectTrack(index)"
              >
                <span class="min-w-0 flex-1 truncate text-[12.5px]">{{ track.title }}</span>
                <span v-if="index === trackIndex" class="text-[9px] uppercase tracking-[0.14em]">
                  {{ t('radio.current') }}
                </span>
              </UButton>
              <p class="mt-2 border-t border-[var(--sz-border)] px-1 pt-2 text-[10px] text-[var(--sz-text-dim)]">
                {{ t('radio.credits') }}
              </p>
            </div>
          </template>
        </UPopover>

        <UButton
          icon="i-lucide-chevron-down"
          :aria-label="t('radio.hide')"
          :aria-expanded="true"
          color="neutral"
          variant="ghost"
          square
          class="h-11 w-11 shrink-0 justify-center sm:h-9 sm:w-9"
          @click="collapse"
        />
      </div>
    </section>
  </Transition>

  <Transition name="radio-fab">
    <UButton
      v-if="!expanded"
      id="zone-radio-open"
      icon="i-lucide-radio"
      :aria-label="t('radio.open')"
      aria-controls="zone-radio-player"
      :aria-expanded="false"
      color="neutral"
      variant="ghost"
      square
      class="fixed bottom-3 right-3 z-30 h-11 w-11 justify-center border border-[var(--sz-border)] bg-ink-950 text-[var(--sz-accent)] shadow-none sm:bottom-4 sm:right-4"
      @click="expand"
    >
      <span
        v-if="status === 'playing'"
        class="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[var(--sz-success-text)]"
        aria-hidden="true"
      />
    </UButton>
  </Transition>
</template>

<style scoped>
.radio-bar-enter-active,
.radio-bar-leave-active,
.radio-fab-enter-active,
.radio-fab-leave-active {
  transition:
    transform 200ms ease,
    opacity 160ms ease;
}

.radio-bar-enter-from,
.radio-bar-leave-to {
  opacity: 0;
  transform: translateY(100%);
}

.radio-fab-enter-from,
.radio-fab-leave-to {
  opacity: 0;
  transform: scale(0.85) translateY(0.5rem);
}

@media (prefers-reduced-motion: reduce) {
  .radio-bar-enter-active,
  .radio-bar-leave-active,
  .radio-fab-enter-active,
  .radio-fab-leave-active {
    transition: none;
  }
}
</style>

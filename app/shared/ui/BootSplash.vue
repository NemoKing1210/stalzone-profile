<script setup lang="ts">
const { t } = useI18n();

const visible = ref(true);
const leaving = ref(false);
let safety: ReturnType<typeof setTimeout> | undefined;

/**
 * The panel lives in the server markup and covers the shell until the client is hydrated,
 * so the first paint is branded instead of a half-rendered screen. `app:mounted` fires
 * after the hydrated tree and the initial async data are in place; `onNuxtReady` was not
 * used because it waits for an idle slot, which a background tab may postpone for seconds.
 */
onMounted(() => {
  // `onMounted` on the app-level component already runs after the hydrated tree exists;
  // waiting for `app:mounted` left the panel up until the failsafe when that hook is late.
  // Keep a short failsafe for a stuck font promise, then dismiss unconditionally.
  safety = setTimeout(hide, 2_000);
  void dismiss();
});

async function dismiss(): Promise<void> {
  clearTimeout(safety);
  await fontsSettled();
  hide();
}

/**
 * The fade is driven here rather than by <Transition>: Vue measures every animation on the
 * element and would hold the removal until the 8s CSS failsafe ends, leaving an invisible
 * but mounted overlay in front of the page.
 */
function hide(): void {
  if (leaving.value) return;
  leaving.value = true;
  setTimeout(() => {
    visible.value = false;
  }, 260);
}

/** One frame of the wordmark in its real face beats a late swap; a stuck font must not hold the screen. */
async function fontsSettled(): Promise<void> {
  if (!document.fonts) return;
  await Promise.race([document.fonts.ready, delay(600)]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
</script>

<template>
  <div v-if="visible" class="sz-boot" :class="{ 'sz-boot--leaving': leaving }">
    <span class="sr-only" role="status">{{ t('common.bootLoading') }}</span>
    <div class="sz-boot__panel" aria-hidden="true">
      <svg class="sz-boot__mark" viewBox="0 0 64 64" focusable="false">
        <circle class="sz-boot__ring" cx="32" cy="32" r="27" />
        <g class="sz-boot__blades">
          <circle cx="32" cy="32" r="5" />
          <path d="M32 32 L18.5 8.6 A27 27 0 0 1 45.5 8.6 Z" />
          <path d="M32 32 L18.5 8.6 A27 27 0 0 1 45.5 8.6 Z" transform="rotate(120 32 32)" />
          <path d="M32 32 L18.5 8.6 A27 27 0 0 1 45.5 8.6 Z" transform="rotate(240 32 32)" />
        </g>
      </svg>

      <p class="sz-boot__wordmark">
        <span>{{ t('common.brandLeft') }}</span>
        <span class="sz-boot__slash">//</span>
        <span>{{ t('common.brandRight') }}</span>
      </p>

      <span class="sz-boot__track"><span class="sz-boot__scan" /></span>
      <p class="sz-boot__label">{{ t('common.bootLoading') }}</p>
    </div>
  </div>
</template>

<style scoped>
/* Hidden stock: the inline head script stamps `js` on <html> before the first paint. With
   scripting off the page is readable at once instead of waiting out the failsafe. */
.sz-boot {
  display: none;
}

.js .sz-boot {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background-color: var(--sz-bg);
  background-image:
    repeating-linear-gradient(0deg, color-mix(in srgb, var(--sz-accent) 3%, transparent) 0 1px, transparent 1px 28px),
    repeating-linear-gradient(90deg, color-mix(in srgb, var(--sz-accent) 3%, transparent) 0 1px, transparent 1px 28px),
    radial-gradient(ellipse 120% 90% at 50% 46%, transparent 38%, var(--sz-atmosphere-vignette) 100%);
  transition: opacity 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
  /* A script error after paint must never trap the page behind the panel. */
  animation: sz-boot-failsafe 240ms ease 8s forwards;
}

.sz-boot--leaving {
  opacity: 0;
  pointer-events: none;
}

.sz-boot__panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  width: min(260px, 70vw);
  text-align: center;
}

.sz-boot__mark {
  width: 46px;
  height: 46px;
  color: var(--sz-accent);
}

.sz-boot__ring {
  fill: none;
  stroke: color-mix(in srgb, var(--sz-accent) 45%, transparent);
  stroke-width: 1.5;
  stroke-dasharray: 2 5;
  transform-box: fill-box;
  transform-origin: center;
  animation: sz-boot-spin 9s linear infinite;
}

.sz-boot__blades {
  fill: currentColor;
}

.sz-boot__wordmark {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-family: var(--font-brand);
  font-size: 26px;
  line-height: 1;
  letter-spacing: 0.16em;
  color: var(--sz-text);
}

.sz-boot__slash {
  color: var(--sz-accent);
}

.sz-boot__track {
  position: relative;
  display: block;
  width: 100%;
  height: 3px;
  overflow: hidden;
  background: var(--sz-surface-header);
}

/* Indeterminate on purpose: the client cannot know the remaining time, so the rule scans
   instead of pretending to be a percentage. */
.sz-boot__scan {
  position: absolute;
  inset: 0 auto 0 0;
  width: 34%;
  background: var(--sz-accent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--sz-accent) 55%, transparent);
  animation: sz-boot-scan 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.sz-boot__label {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--sz-text-muted);
}

@keyframes sz-boot-scan {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(294%);
  }
}

@keyframes sz-boot-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes sz-boot-failsafe {
  to {
    opacity: 0;
    visibility: hidden;
  }
}
</style>

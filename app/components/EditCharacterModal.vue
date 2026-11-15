<script setup lang="ts">
import { CharacterPatchSchema } from '@dossier/shared/schemas';
import type { DossierCharacter } from '~/composables/useDossier';
import type { WriteResult } from '~/composables/useWrite';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ character: DossierCharacter }>();
const emit = defineEmits<{ saved: [] }>();

const { write, busy } = useWrite();

const form = reactive({
  nick: '',
  faction: null as string | null | undefined,
  alliance: null as string | null | undefined,
  clan: null as string | null | undefined,
  arrived: null as string | null | undefined,
  hours: null as number | null,
  kd: null as number | null,
  accuracy: null as number | null,
  headshot: null as number | null,
  achievements: null as number | null,
  achievementPoints: null as number | null,
  money: null as number | null,
  maxMoney: null as number | null,
  stash: null as string | null | undefined,
  playstyle: null as string | null | undefined,
  dryRun: false,
});

const lastResult = ref<WriteResult | null>(null);

watch(open, (value) => {
  if (value) reset();
});
watch(
  () => props.character,
  () => {
    if (open.value) reset();
  },
);

function reset(): void {
  const character = props.character;
  form.nick = character.nick ?? '';
  form.faction = character.faction ?? null;
  form.alliance = character.alliance ?? null;
  form.clan = character.clan ?? null;
  form.arrived = character.arrived ?? null;
  form.hours = character.hours ?? null;
  form.kd = character.kd ?? null;
  form.accuracy = character.accuracy ?? null;
  form.headshot = character.headshot ?? null;
  form.achievements = character.achievements ?? null;
  form.achievementPoints = character.achievementPoints ?? null;
  form.money = character.money ?? null;
  form.maxMoney = character.maxMoney ?? null;
  form.stash = character.stash ?? null;
  form.playstyle = character.playstyle ?? null;
  form.dryRun = false;
  lastResult.value = null;
}

async function submit(): Promise<void> {
  const result = await write<WriteResult>('/api/v1/character', {
    method: 'PATCH',
    body: {
      ...(form.nick ? { nick: form.nick } : {}),
      faction: form.faction ?? null,
      alliance: form.alliance ?? null,
      clan: form.clan ?? null,
      arrived: form.arrived ?? null,
      hours: form.hours,
      kd: form.kd,
      accuracy: form.accuracy,
      headshot: form.headshot,
      achievements: form.achievements,
      achievementPoints: form.achievementPoints,
      money: form.money,
      maxMoney: form.maxMoney,
      stash: form.stash ?? null,
      playstyle: form.playstyle ?? null,
      dryRun: form.dryRun,
    },
  });
  if (!result) return;

  lastResult.value = result;
  if (!result.dryRun) {
    open.value = false;
    emit('saved');
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Персонаж" description="Правка профиля и статистики" scrollable>
    <template #body>
      <UForm :schema="CharacterPatchSchema" :state="form" class="space-y-4" @submit="submit">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Ник" name="nick">
            <UInput v-model="form.nick" class="w-full" />
          </UFormField>
          <UFormField label="Фракция" name="faction">
            <UInput v-model.nullable="form.faction" class="w-full" />
          </UFormField>
          <UFormField label="Альянс" name="alliance">
            <UInput v-model.nullable="form.alliance" class="w-full" />
          </UFormField>
          <UFormField label="Клан" name="clan">
            <UInput v-model.nullable="form.clan" class="w-full" />
          </UFormField>
          <UFormField label="В Зоне с" name="arrived">
            <UInput v-model.nullable="form.arrived" placeholder="2024-12-06" class="w-full" />
          </UFormField>
          <UFormField label="Часов в игре" name="hours">
            <UInputNumber v-model="form.hours" :min="0" class="w-full" />
          </UFormField>
          <UFormField label="K/D" name="kd">
            <UInputNumber v-model="form.kd" :step="0.01" :min="0" class="w-full" />
          </UFormField>
          <UFormField label="Точность, %" name="accuracy">
            <UInputNumber v-model="form.accuracy" :min="0" :max="100" class="w-full" />
          </UFormField>
          <UFormField label="В голову, %" name="headshot">
            <UInputNumber v-model="form.headshot" :min="0" :max="100" class="w-full" />
          </UFormField>
          <UFormField label="Достижения" name="achievements">
            <UInputNumber v-model="form.achievements" :min="0" class="w-full" />
          </UFormField>
          <UFormField label="Очки достижений" name="achievementPoints">
            <UInputNumber v-model="form.achievementPoints" :min="0" class="w-full" />
          </UFormField>
          <UFormField label="Деньги" name="money">
            <UInputNumber v-model="form.money" :min="0" class="w-full" />
          </UFormField>
          <UFormField label="Максимум денег" name="maxMoney">
            <UInputNumber v-model="form.maxMoney" :min="0" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Тайник" name="stash">
          <UInput v-model.nullable="form.stash" class="w-full" />
        </UFormField>
        <UFormField label="Стиль игры" name="playstyle">
          <UTextarea v-model.nullable="form.playstyle" :rows="2" class="w-full" />
        </UFormField>

        <UFormField name="dryRun">
          <USwitch v-model="form.dryRun" label="Пробный прогон: показать изменения без записи" />
        </UFormField>

        <UAlert
          v-if="lastResult"
          :color="lastResult.dryRun ? 'info' : 'success'"
          variant="subtle"
          icon="i-lucide-list-checks"
          :title="lastResult.dryRun ? 'Пробный прогон' : 'Изменение записано'"
          :description="lastResult.diff.human"
        />

        <div class="flex justify-end gap-2">
          <UButton type="button" color="neutral" variant="ghost" label="Отмена" @click="open = false" />
          <UButton type="submit" :loading="busy" :label="form.dryRun ? 'Проверить' : 'Сохранить'" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>

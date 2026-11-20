import { type Db, updateChatSettings } from '@profile/core';
import { ChatSettingsUpdateSchema } from '@profile/shared/contracts';
import { upsertCharacter } from '@profile/core/testing';

/** Ollama-style settings: no key is required, the fake fetch owns the endpoint. */
export function setChatSettings(db: Db): void {
  upsertCharacter(db, { nick: 'Tester', region: 'ru' });
  process.env.NUXT_AI_OLLAMA_API_KEY = 'test-key';
  updateChatSettings(
    db,
    ChatSettingsUpdateSchema.parse({
      provider: 'ollama',
      baseUrl: 'http://ollama.test/v1',
      model: 'test-model',
      readToolAllowList: ['get_character'],
    }),
  );
}

import { activePromptViews, composeChatPrompt } from '@profile/core';
import { useDb } from '../../../utils/db';

export default defineEventHandler(() => {
  const db = useDb();
  return { prompts: activePromptViews(db), composed: composeChatPrompt(db) };
});

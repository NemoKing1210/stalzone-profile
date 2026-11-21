/** Fullwidth bars are what DeepSeek emits; ASCII bars are accepted too. */
const DSML_MARKER = /\|\s*DSML\s*\|/i;

/**
 * Older messages may already contain leaked tool-call markup (a gateway returned DeepSeek's
 * native format as text). The server recovers new calls and strips the markup; the reader
 * also hides any block that is already stored so the page never shows raw tags.
 */
export function cleanAssistantText(text: string): string {
  const normalized = text.replaceAll('\uff5c', '|');
  if (!DSML_MARKER.test(normalized)) return text;
  return normalized
    .replace(/<\s*\|DSML\|\s*calls\s*>[\s\S]*?<\/\s*\|DSML\|\s*calls\s*>/gi, '')
    .replace(/<\s*\|DSML\|[\s\S]*$/i, '')
    .trim();
}

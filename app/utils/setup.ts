/**
 * The wizard closes itself only when the owner arrived with a character. Right
 * after a create the refreshed state also says "set up", but the catalog and
 * profile steps still have to run.
 */
export function shouldCloseSetup(input: { needsSetup: boolean; createdHere: boolean }): boolean {
  return !input.needsSetup && !input.createdHere;
}

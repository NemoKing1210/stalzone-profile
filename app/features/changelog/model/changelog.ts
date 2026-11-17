/// <reference types="vite/client" />
import raw from '../../../../CHANGELOG.md?raw';

import { parseChangelog } from './parse';

/** The changelog is read at build time, so the page works in SSR and in Docker. */
export const changelog = parseChangelog(raw);

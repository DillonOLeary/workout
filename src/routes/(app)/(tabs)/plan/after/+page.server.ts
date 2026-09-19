import { savePreferences } from '$lib/server/preferences';
import type { Actions } from './$types';

export const actions: Actions = { save: savePreferences };

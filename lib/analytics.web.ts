// [ANALYTICS-GA4] En web (Expo web) no se usa Firebase nativo: todas las llamadas son no-op.
// Metro elige este archivo en lugar de analytics.ts solo para la plataforma web.
import type { Ga4 } from './analytics';

export type { Ga4ItemInput } from './analytics';

export const ga4: Ga4 = new Proxy({} as Ga4, {
  get: () => () => Promise.resolve(),
});

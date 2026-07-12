import { ValueTransformer } from 'typeorm';

/** PostgreSQL `numeric` returns a string via node-postgres; map it to a JS number. */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null): number | null | undefined => value,
  from: (value?: string | null): number | null | undefined =>
    value === null || value === undefined ? value : parseFloat(value),
};

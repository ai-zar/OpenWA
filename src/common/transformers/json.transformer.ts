import { ValueTransformer } from 'typeorm';

const parse = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const JsonArrayTransformer = <T = unknown>(): ValueTransformer => ({
  from: (value: unknown): T[] => parse<T[]>(value, [] as T[]),
  to: (value: T[] | null | undefined): T[] | null | undefined => value,
});

export const JsonObjectTransformer = <T extends Record<string, unknown> = Record<string, unknown>>(): ValueTransformer => ({
  from: (value: unknown): T => parse<T>(value, {} as T),
  to: (value: T | null | undefined): T | null | undefined => value,
});

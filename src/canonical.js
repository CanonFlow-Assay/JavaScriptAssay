import { createHash } from 'node:crypto';
export const canonical = (value) =>
  JSON.stringify(
    value,
    (_, item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, item[key]])
          )
        : item,
    2
  ) + '\n';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

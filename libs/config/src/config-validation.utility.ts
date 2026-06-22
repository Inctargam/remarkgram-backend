import process from 'node:process';
import { validateSync } from 'class-validator';

export const configValidationUtility = {
  validateConfig(config: object): void {
    const errors = validateSync(config);

    if (errors.length > 0) {
      const messages = errors.map((error) => Object.values(error.constraints ?? {}).join(', ')).join('; ');

      throw new Error(`Validation failed: ${messages} ${process.env.NODE_ENV ?? ''}`.trim());
    }
  },

  convertToBoolean(value: string): boolean {
    const trimmedValue = value?.trim();

    if (trimmedValue === 'true' || trimmedValue === '1' || trimmedValue === 'enabled') {
      return true;
    }

    if (trimmedValue === 'false' || trimmedValue === '0' || trimmedValue === 'disabled') {
      return false;
    }

    throw new Error(`Config convertToBoolean failed: ${value}`);
  },

  convertToNumber(value: unknown): number {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
      throw new Error(`Config convertToNumber failed: input:${String(value)} = ${numberValue}`);
    }

    return numberValue;
  },

  getEnumValues<T extends Record<string, string>>(enumObject: T): string[] {
    return Object.values(enumObject);
  },
};

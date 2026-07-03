import { Transform, type TransformFnParams } from 'class-transformer';

/** Удаляет пробелы в начале и конце строкового значения входного HTTP DTO. */
export const Trim = () =>
  Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  );

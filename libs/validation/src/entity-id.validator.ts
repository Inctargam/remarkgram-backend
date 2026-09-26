const MAX_INTEGER = 2_147_483_647;

export function isValidNumericEntityId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0 && id < MAX_INTEGER;
}

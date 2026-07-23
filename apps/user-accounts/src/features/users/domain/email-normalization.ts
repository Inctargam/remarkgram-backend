/** Единая нормализация email для сравнения, поиска и сохранения. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

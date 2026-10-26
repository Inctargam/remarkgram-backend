export type Country = {
  code: string;
  name: Readonly<Record<'ru' | 'en', string>>;
};

export type SearchCountriesOptions = {
  term?: string;
  limit?: number;
};

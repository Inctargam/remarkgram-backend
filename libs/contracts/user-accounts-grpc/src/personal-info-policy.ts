// Контекст: PERSONAL_INFO -> ПОЛЕ -> ОГРАНИЧЕНИЕ
export const PERSONAL_INFO_FIRST_NAME_MIN_LENGTH = 1;
export const PERSONAL_INFO_FIRST_NAME_MAX_LENGTH = 50;

export const PERSONAL_INFO_LAST_NAME_MIN_LENGTH = 1;
export const PERSONAL_INFO_LAST_NAME_MAX_LENGTH = 50;

export const PERSONAL_INFO_NAME_PATTERN = /^[\p{L}\p{M}]+(?:[ '\u2019\p{Pd}][\p{L}\p{M}]+)*$/u;

export const PERSONAL_INFO_ABOUT_ME_MAX_LENGTH = 500;

export const PERSONAL_INFO_COUNTRY_CODE_LENGTH = 2;
export const PERSONAL_INFO_COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

export const PERSONAL_INFO_CITY_MIN_LENGTH = 1;
export const PERSONAL_INFO_CITY_MAX_LENGTH = 100;
export const PERSONAL_INFO_CITY_PATTERN = /^[\p{L}\s'’.-]+$/u;

export const BIRTH_DATE_FORMAT = 'YYYY-MM-DD';
export const BIRTH_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
export const BIRTH_DATE_MIN_ALLOWED_AGE = 13;

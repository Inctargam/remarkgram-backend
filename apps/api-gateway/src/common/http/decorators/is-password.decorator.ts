import { applyDecorators } from '@nestjs/common';
import { IsString, Length, Matches } from 'class-validator';

/** Validates an HTTP DTO password according to the public password policy. */
export const IsPassword = () =>
  applyDecorators(
    IsString(),
    Length(6, 20),
    Matches(/[0-9]/),
    Matches(/[A-Z]/),
    Matches(/[a-z]/),
    Matches(/^[\x21-\x5F\x61-\x7E]+$/),
  );

import { Transform, type TransformFnParams } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

const Trim = () =>
  Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  );

export class LoginInputDto {
  @IsString()
  @Trim()
  @IsNotEmpty()
  declare loginOrEmail: string;

  @IsString()
  @Trim()
  @IsNotEmpty()
  declare password: string;
}

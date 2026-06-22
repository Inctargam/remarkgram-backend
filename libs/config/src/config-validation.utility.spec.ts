import { IsString } from 'class-validator';
import { configValidationUtility } from './config-validation.utility.js';

class TestConfig {
  @IsString()
  VALUE!: string;
}

describe('configValidationUtility', () => {
  it('validates a config instance', () => {
    const config = new TestConfig();
    config.VALUE = 'value';

    expect(() => configValidationUtility.validateConfig(config)).not.toThrow();
  });

  it('throws for an invalid config instance', () => {
    expect(() => configValidationUtility.validateConfig(new TestConfig())).toThrow('Validation failed:');
  });

  it.each([
    ['true', true],
    ['1', true],
    ['enabled', true],
    ['false', false],
    ['0', false],
    ['disabled', false],
  ])('converts %s to %s', (value, expected) => {
    expect(configValidationUtility.convertToBoolean(value)).toBe(expected);
  });

  it('converts a value to a number', () => {
    expect(configValidationUtility.convertToNumber('3003')).toBe(3003);
  });

  it('throws when a value cannot be converted to a number', () => {
    expect(() => configValidationUtility.convertToNumber('invalid')).toThrow('Config convertToNumber failed');
  });
});

import { BadRequestException, type INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { ClientGrpc } from '@nestjs/microservices';
import { REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME, USERS_SERVICE_NAME } from '@app/user-accounts-grpc';
import { CountriesApi } from '@app/countries';
import type { NextFunction, Request, Response } from 'express';
import { of, throwError } from 'rxjs';
import request from 'supertest';
import { Public } from '../../../../../common/http/decorators/public.decorator.js';
import type { RequestWithUserId } from '../auth-request.types.js';
import { UpdateProfileInfoDto } from '../dto/input/update-profile-info.dto.js';
import { UserProfileHttpController } from './user-profile.http-controller.js';

type SupertestApp = Parameters<typeof request>[0];

describe(UserProfileHttpController.name, () => {
  const updateProfileInfo = vi.fn();
  const getMyProfile = vi.fn();
  const getPublicProfile = vi.fn();
  const usersService = { updateProfileInfo, getMyProfile, getPublicProfile };
  const grpcClient = {
    getService: vi.fn(() => usersService),
  };
  const countriesApi = {
    exists: vi.fn(),
    findByCode: vi.fn(),
  };
  const controller = new UserProfileHttpController(
    grpcClient as unknown as ClientGrpc,
    countriesApi as unknown as CountriesApi,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    countriesApi.exists.mockResolvedValue(true);
    updateProfileInfo.mockReturnValue(of({}));
    getMyProfile.mockReturnValue(of({}));
    getPublicProfile.mockReturnValue(of({}));
    controller.onModuleInit();
  });

  it('uses authenticated request userId and sends the complete gRPC payload once', async () => {
    await controller.updateProfileInfo(
      {
        username: 'username',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        aboutMe: 'About me',
        countryCode: 'UA',
        city: 'Kyiv',
      },
      { userId: '42' } as RequestWithUserId,
    );

    expect(countriesApi.exists).toHaveBeenCalledOnce();
    expect(countriesApi.exists).toHaveBeenCalledWith('UA');
    expect(grpcClient.getService).toHaveBeenCalledWith(USERS_SERVICE_NAME);
    expect(updateProfileInfo).toHaveBeenCalledOnce();
    expect(updateProfileInfo).toHaveBeenCalledWith({
      userId: 42,
      username: 'username',
      personalInfo: {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        aboutMe: 'About me',
        countryCode: 'UA',
        city: 'Kyiv',
      },
    });
  });

  it.each([undefined, '', '   '])(
    'does not query the country catalog when countryCode is %j',
    async (countryCode) => {
      await controller.updateProfileInfo(
        {
          username: 'username',
          firstName: 'John',
          lastName: 'Doe',
          countryCode,
        } as unknown as UpdateProfileInfoDto,
        { userId: '1' } as RequestWithUserId,
      );

      expect(countriesApi.exists).not.toHaveBeenCalled();
      expect(updateProfileInfo).toHaveBeenCalledOnce();
    },
  );

  it('rejects an unknown country without calling gRPC', async () => {
    countriesApi.exists.mockResolvedValue(false);

    await expect(
      controller.updateProfileInfo(
        {
          username: 'username',
          firstName: 'John',
          lastName: 'Doe',
          countryCode: 'ZZ',
        } as unknown as UpdateProfileInfoDto,
        { userId: '1' } as RequestWithUserId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(countriesApi.exists).toHaveBeenCalledWith('ZZ');
    expect(updateProfileInfo).not.toHaveBeenCalled();
  });

  it('propagates a country catalog error without calling gRPC', async () => {
    const error = new Error('country catalog unavailable');
    countriesApi.exists.mockRejectedValue(error);

    await expect(
      controller.updateProfileInfo(
        {
          username: 'username',
          firstName: 'John',
          lastName: 'Doe',
          countryCode: 'UA',
        } as unknown as UpdateProfileInfoDto,
        { userId: '1' } as RequestWithUserId,
      ),
    ).rejects.toBe(error);
    expect(updateProfileInfo).not.toHaveBeenCalled();
  });

  it('propagates a gRPC error', async () => {
    const error = new Error('user accounts unavailable');
    updateProfileInfo.mockReturnValue(throwError(() => error));

    await expect(
      controller.updateProfileInfo(
        { username: 'username', firstName: 'John', lastName: 'Doe' } as unknown as UpdateProfileInfoDto,
        {
          userId: '1',
        } as RequestWithUserId,
      ),
    ).rejects.toBe(error);
    expect(updateProfileInfo).toHaveBeenCalledOnce();
  });

  it('is not marked public and therefore remains behind the global access-token guard', () => {
    const reflector = new Reflector();

    expect(
      // Metadata must be read from the original handler function, not from a bound copy.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      reflector.getAllAndOverride(Public, [controller.updateProfileInfo, UserProfileHttpController]),
    ).toBeUndefined();
  });

  describe('profile reads', () => {
    it('maps a complete private profile and resolves its country', async () => {
      getMyProfile.mockReturnValue(
        of({
          userId: 42,
          username: 'username',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-15',
          aboutMe: 'About me',
          countryCode: 'UA',
          city: 'Kyiv',
          avatarFileId: 'avatar-id',
        }),
      );
      countriesApi.findByCode.mockResolvedValue({
        code: 'UA',
        name: { en: 'Ukraine', ru: 'Украина' },
      });

      const result = await controller.getMyProfile({ userId: '42' } as RequestWithUserId);

      expect(getMyProfile).toHaveBeenCalledWith({ userId: 42 });
      expect(countriesApi.findByCode).toHaveBeenCalledWith('UA');
      expect(result).toEqual({
        userId: 42,
        username: 'username',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        aboutMe: 'About me',
        country: { code: 'UA', name: { en: 'Ukraine', ru: 'Украина' } },
        city: 'Kyiv',
        avatarFileId: 'avatar-id',
      });
    });

    it('returns null private optionals and a null country for a stale country code', async () => {
      getMyProfile.mockReturnValue(
        of({
          userId: 7,
          username: 'username',
          firstName: undefined,
          lastName: undefined,
          dateOfBirth: undefined,
          aboutMe: undefined,
          countryCode: 'ZZ',
          city: undefined,
          avatarFileId: undefined,
        }),
      );
      countriesApi.findByCode.mockResolvedValue(null);

      await expect(controller.getMyProfile({ userId: '7' } as RequestWithUserId)).resolves.toEqual({
        userId: 7,
        username: 'username',
        firstName: null,
        lastName: null,
        dateOfBirth: null,
        aboutMe: null,
        country: null,
        city: null,
        avatarFileId: null,
      });
    });

    it('does not query countries when the private profile has no country code', async () => {
      getMyProfile.mockReturnValue(of({ userId: 7, username: 'username' }));

      await controller.getMyProfile({ userId: '7' } as RequestWithUserId);

      expect(countriesApi.findByCode).not.toHaveBeenCalled();
    });

    it('maps only public profile fields', async () => {
      getPublicProfile.mockReturnValue(
        of({ userId: 42, username: 'username', aboutMe: 'Public bio', avatarFileId: 'avatar-id' }),
      );

      const result = await controller.getPublicProfile({ userId: 42 });

      expect(getPublicProfile).toHaveBeenCalledWith({ userId: 42 });
      expect(result).toEqual({
        userId: 42,
        username: 'username',
        aboutMe: 'Public bio',
        avatarFileId: 'avatar-id',
      });
      expect(result).not.toHaveProperty('firstName');
      expect(result).not.toHaveProperty('lastName');
      expect(result).not.toHaveProperty('dateOfBirth');
      expect(result).not.toHaveProperty('country');
      expect(result).not.toHaveProperty('city');
    });

    it('maps missing public optionals to null', async () => {
      getPublicProfile.mockReturnValue(of({ userId: 7, username: 'username' }));

      await expect(controller.getPublicProfile({ userId: 7 })).resolves.toEqual({
        userId: 7,
        username: 'username',
        aboutMe: null,
        avatarFileId: null,
      });
    });

    it.each([
      ['private', () => controller.getMyProfile({ userId: '42' } as RequestWithUserId), getMyProfile],
      ['public', () => controller.getPublicProfile({ userId: 42 }), getPublicProfile],
    ] as const)('propagates a downstream %s profile error', async (_type, invoke, grpcMethod) => {
      const error = new Error('user accounts unavailable');
      grpcMethod.mockReturnValue(throwError(() => error));

      await expect(invoke()).rejects.toBe(error);
    });
  });

  describe('HTTP validation harness', () => {
    let app: INestApplication;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        controllers: [UserProfileHttpController],
        providers: [
          { provide: REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME, useValue: grpcClient },
          { provide: CountriesApi, useValue: countriesApi },
        ],
      }).compile();
      app = module.createNestApplication();
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as RequestWithUserId).userId = '42';
        next();
      });
      app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    it('returns 204, transforms countryCode, and removes unknown fields', async () => {
      await request(app.getHttpServer() as SupertestApp)
        .put('/users/me/profile')
        .send({
          username: ' username ',
          firstName: ' John ',
          lastName: ' Doe ',
          countryCode: ' ua ',
          unknownAdminField: true,
        })
        .expect(204);

      expect(countriesApi.exists).toHaveBeenCalledWith('UA');
      expect(updateProfileInfo).toHaveBeenCalledOnce();
      expect(updateProfileInfo).toHaveBeenCalledWith({
        userId: 42,
        username: 'username',
        personalInfo: {
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: undefined,
          aboutMe: undefined,
          countryCode: 'UA',
          city: undefined,
        },
      });
      expect(updateProfileInfo.mock.calls[0]?.[0]).not.toHaveProperty('unknownAdminField');
    });

    it('returns 400 and does not call dependencies for an invalid body', async () => {
      await request(app.getHttpServer() as SupertestApp)
        .put('/users/me/profile')
        .send({ firstName: 'John', lastName: 'Doe' })
        .expect(400);

      expect(countriesApi.exists).not.toHaveBeenCalled();
      expect(updateProfileInfo).not.toHaveBeenCalled();
    });

    it('strips unknown body properties with the configured ValidationPipe', async () => {
      const pipe = new ValidationPipe({ transform: true, whitelist: true });

      const dto: unknown = await pipe.transform(
        {
          username: 'username',
          firstName: 'John',
          lastName: 'Doe',
          unknownAdminField: true,
        },
        { type: 'body', metatype: UpdateProfileInfoDto },
      );

      expect(dto).toBeInstanceOf(UpdateProfileInfoDto);
      expect(dto).not.toHaveProperty('unknownAdminField');
    });
  });
});

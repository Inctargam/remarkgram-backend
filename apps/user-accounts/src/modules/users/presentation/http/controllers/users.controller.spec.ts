import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { QueryBus } from '@nestjs/cqrs';
import { GetUsersQuery } from '../../../application/use-cases/get-users.use-case.js';
import { User } from '../../../domain/entities/user.entity.js';
import { UsersController } from './users.controller.js';

describe('UsersController', () => {
  let usersController: UsersController;
  const queryBus = {
    execute: vi.fn(),
  };

  beforeEach(async () => {
    queryBus.execute.mockReset();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: QueryBus,
          useValue: queryBus,
        },
      ],
    }).compile();

    usersController = app.get<UsersController>(UsersController);
  });

  describe('findMany', () => {
    it('should return users', async () => {
      queryBus.execute.mockResolvedValue([
        User.restore({
          id: 1,
          username: 'user',
          email: 'user@example.com',
        }),
      ]);

      await expect(usersController.findMany()).resolves.toEqual([
        {
          id: 1,
          username: 'user',
          email: 'user@example.com',
        },
      ]);
      expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetUsersQuery));
    });
  });
});

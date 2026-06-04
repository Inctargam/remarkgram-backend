import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PostsController } from './posts.controller.js';

describe('PostsController', () => {
  let postsController: PostsController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [PostsController],
    }).compile();

    postsController = app.get<PostsController>(PostsController);
  });

  it('should be defined', () => {
    expect(postsController).toBeDefined();
  });
});

import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { GetPostsQuery } from '../../../application/use-cases/get-posts/get-posts.use-case.js';
import { Post } from '../../../domain/entities/post.entity.js';
import { PostsController } from './posts.controller.js';

describe('PostsController', () => {
  let postsController: PostsController;
  let queryBus: { execute: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    queryBus = {
      execute: vi.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [
        {
          provide: CommandBus,
          useValue: {
            execute: vi.fn(),
          },
        },
        {
          provide: QueryBus,
          useValue: queryBus,
        },
      ],
    }).compile();

    postsController = app.get<PostsController>(PostsController);
  });

  it('should be defined', () => {
    expect(postsController).toBeDefined();
  });

  it('should return all posts', async () => {
    const posts = [
      Post.restore({
        id: 1,
        title: 'First post',
        content: 'Post content',
      }),
    ];
    queryBus.execute.mockResolvedValue(posts);

    const result = await postsController.getPosts();

    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetPostsQuery));
    expect(result).toEqual([
      {
        id: 1,
        title: 'First post',
        content: 'Post content',
      },
    ]);
  });
});

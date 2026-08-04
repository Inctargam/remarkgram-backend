import { FilesGrpcController } from './files-grpc.controller.js';
import { ImageContentType } from '@app/files-grpc';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CompleteImageUploadsCommand } from '../../application/use-cases/complete-image-uploads/complete-image-uploads.use-case.js';
import { InitiateImageUploadsCommand } from '../../application/use-cases/initiate-image-uploads/initiate-image-uploads.use-case.js';
import { EnsureCompletedImageUploadsQuery } from '../../application/use-cases/ensure-completed-image-uploads/ensure-completed-image-uploads.use-case.js';

describe('FilesGrpcController', () => {
  const commandBus = { execute: vi.fn() };
  const queryBus = { execute: vi.fn() };

  beforeEach(() => {
    commandBus.execute.mockReset();
    queryBus.execute.mockReset();
  });

  it('delegates image upload initiation to the use case', async () => {
    const controller = new FilesGrpcController(
      commandBus as unknown as CommandBus,
      queryBus as unknown as QueryBus,
    );
    const request = {
      userId: '42',
      images: [
        {
          clientFileId: '11111111-1111-4111-8111-111111111111',
          originalFilename: 'first.jpg',
          contentType: ImageContentType.JPEG,
          size: 1_024,
        },
        {
          clientFileId: '22222222-2222-4222-8222-222222222222',
          originalFilename: 'second.png',
          contentType: ImageContentType.PNG,
          size: 2_048,
        },
      ],
    };
    const expectedResponse = {
      sessions: [
        {
          id: 'first-upload-id',
          clientFileId: '11111111-1111-4111-8111-111111111111',
          url: 'https://storage.example.com',
          fields: { key: 'first-object-key' },
        },
        {
          id: 'second-upload-id',
          clientFileId: '22222222-2222-4222-8222-222222222222',
          url: 'https://storage.example.com',
          fields: { key: 'second-object-key' },
        },
      ],
    };
    commandBus.execute.mockResolvedValue(expectedResponse);

    await expect(controller.initiateImageUploads(request)).resolves.toEqual(expectedResponse);

    expect(commandBus.execute).toHaveBeenCalledWith(
      new InitiateImageUploadsCommand({
        userId: 42,
        images: request.images,
      }),
    );
  });

  it('delegates image upload completion to the use case', async () => {
    const controller = new FilesGrpcController(
      commandBus as unknown as CommandBus,
      queryBus as unknown as QueryBus,
    );
    const request = {
      userId: '42',
      uploadIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
    };
    commandBus.execute.mockResolvedValue(undefined);

    await expect(controller.completeImageUploads(request)).resolves.toEqual({});

    expect(commandBus.execute).toHaveBeenCalledWith(
      new CompleteImageUploadsCommand({
        userId: 42,
        uploadIds: request.uploadIds,
      }),
    );
  });

  it('delegates completed image verification to the use case', async () => {
    const controller = new FilesGrpcController(
      commandBus as unknown as CommandBus,
      queryBus as unknown as QueryBus,
    );
    const request = {
      userId: '42',
      imageIds: ['11111111-1111-4111-8111-111111111111'],
    };
    queryBus.execute.mockResolvedValue(undefined);

    await expect(controller.ensureCompletedImageUploads(request)).resolves.toEqual({});

    expect(queryBus.execute).toHaveBeenCalledWith(
      new EnsureCompletedImageUploadsQuery({
        userId: 42,
        imageIds: request.imageIds,
      }),
    );
  });
});

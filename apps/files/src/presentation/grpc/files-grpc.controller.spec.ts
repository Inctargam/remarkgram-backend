import { FilesGrpcController } from './files-grpc.controller.js';
import { ImageContentType } from '@app/files-grpc';
import type { CommandBus } from '@nestjs/cqrs';
import { InitiateImageUploadsCommand } from '../../application/use-cases/initiate-image-uploads/initiate-image-uploads.use-case.js';

describe('FilesGrpcController', () => {
  const commandBus = { execute: vi.fn() };

  beforeEach(() => {
    commandBus.execute.mockReset();
  });

  it('delegates image upload initiation to the use case', async () => {
    const controller = new FilesGrpcController(commandBus as unknown as CommandBus);
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
});

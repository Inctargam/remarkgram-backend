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
      userId: 'user-id',
      images: [
        { originalFilename: 'first.jpg', contentType: ImageContentType.JPEG, size: 1_024 },
        { originalFilename: 'second.png', contentType: ImageContentType.PNG, size: 2_048 },
      ],
    };
    const expectedResponse = {
      sessions: [{ id: 'first-upload-id' }, { id: 'second-upload-id' }],
    };
    commandBus.execute.mockResolvedValue(expectedResponse);

    await expect(controller.initiateImageUploads(request)).resolves.toEqual(expectedResponse);

    expect(commandBus.execute).toHaveBeenCalledWith(new InitiateImageUploadsCommand(request));
  });
});

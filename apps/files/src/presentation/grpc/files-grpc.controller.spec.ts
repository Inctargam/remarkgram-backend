import { FilesGrpcController } from './files-grpc.controller.js';
import { ImageContentType } from '@app/files-grpc';
import type { CommandBus } from '@nestjs/cqrs';
import { CreateImageUploadSessionsCommand } from '../../application/use-cases/create-image-upload-sessions/create-image-upload-sessions.use-case.js';

describe('FilesGrpcController', () => {
  const commandBus = { execute: vi.fn() };

  beforeEach(() => {
    commandBus.execute.mockReset();
  });

  it('delegates creation of upload sessions to the use case', async () => {
    const controller = new FilesGrpcController(commandBus as unknown as CommandBus);
    const request = {
      userId: 'user-id',
      images: [
        { originalFilename: 'first.jpg', contentType: ImageContentType.JPEG, size: 1_024 },
        { originalFilename: 'second.png', contentType: ImageContentType.PNG, size: 2_048 },
      ],
    };
    const expectedResponse = {
      uploads: [{ id: 'first-upload-id' }, { id: 'second-upload-id' }],
    };
    commandBus.execute.mockResolvedValue(expectedResponse);

    await expect(controller.createImageUploads(request)).resolves.toEqual(expectedResponse);

    expect(commandBus.execute).toHaveBeenCalledWith(new CreateImageUploadSessionsCommand(request));
  });
});

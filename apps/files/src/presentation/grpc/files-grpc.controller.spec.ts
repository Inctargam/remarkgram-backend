import { AttachPostImagesCommand } from '../../application/use-cases/attach-post-images/attach-post-images.use-case.js';
import { CancelPostImageAttachmentCommand } from '../../application/use-cases/cancel-post-image-attachment/cancel-post-image-attachment.use-case.js';
import { RpcException } from '@nestjs/microservices';
import { AttachAvatarFileCommand } from '../../application/use-cases/attach-avatar-file/attach-avatar-file.use-case.js';
import { ScheduleAttachedFileDeletionCommand } from '../../application/use-cases/schedule-attached-file-deletion/schedule-attached-file-deletion.use-case.js';
import { FilesGrpcController } from './files-grpc.controller.js';
import { ImageContentType } from '@app/files-grpc';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CompleteImageUploadsCommand } from '../../application/use-cases/complete-image-uploads/complete-image-uploads.use-case.js';
import { InitiateImageUploadsCommand } from '../../application/use-cases/initiate-image-uploads/initiate-image-uploads.use-case.js';
import { InitiateAvatarUploadCommand } from '../../application/use-cases/initiate-avatar-upload/initiate-avatar-upload.use-case.js';

describe('FilesGrpcController', () => {
  const commandBus = { execute: vi.fn() };
  const queryBus = { execute: vi.fn() };

  const createController = () =>
    new FilesGrpcController(commandBus as unknown as CommandBus, queryBus as unknown as QueryBus);

  beforeEach(() => {
    commandBus.execute.mockReset();
    queryBus.execute.mockReset();
  });

  it('maps avatar attachment and deletion RPCs to commands', async () => {
    const fileId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
    const operationId = 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB';
    const controller = createController();
    await expect(controller.attachAvatarFile({ userId: '42', fileId, operationId })).resolves.toEqual({});
    expect(commandBus.execute).toHaveBeenCalledWith(
      new AttachAvatarFileCommand({
        userId: 42,
        fileId: fileId.toLowerCase(),
        operationId: operationId.toLowerCase(),
      }),
    );
    await expect(controller.scheduleAttachedFileDeletion({ userId: '42', fileId })).resolves.toEqual({});
    expect(commandBus.execute).toHaveBeenCalledWith(
      new ScheduleAttachedFileDeletionCommand({ userId: 42, fileId: fileId.toLowerCase() }),
    );
  });

  it('rejects invalid UUIDs before dispatching new Files commands', async () => {
    const controller = createController();
    await expect(
      controller.attachAvatarFile({ userId: '42', fileId: 'bad', operationId: 'bad' }),
    ).rejects.toBeInstanceOf(RpcException);
    await expect(
      controller.scheduleAttachedFileDeletion({ userId: '42', fileId: 'bad' }),
    ).rejects.toBeInstanceOf(RpcException);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('delegates avatar upload initiation with a numeric user ID and returns one session', async () => {
    const request = {
      userId: '42',
      clientFileId: '11111111-1111-4111-8111-111111111111',
      originalFilename: 'avatar.png',
      contentType: ImageContentType.PNG,
      size: 1024,
    };
    const session = {
      id: 'upload-id',
      clientFileId: request.clientFileId,
      url: 'https://storage.example.com',
      fields: {},
    };
    commandBus.execute.mockResolvedValue(session);
    await expect(createController().initiateAvatarUpload(request)).resolves.toEqual(session);
    expect(commandBus.execute).toHaveBeenCalledWith(
      new InitiateAvatarUploadCommand({ ...request, userId: 42 }),
    );
  });

  it('delegates image upload initiation to the use case', async () => {
    const controller = createController();
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
    const controller = createController();
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

  it.each([
    ['attachPostImages', AttachPostImagesCommand],
    ['cancelPostImageAttachment', CancelPostImageAttachmentCommand],
  ] as const)('validates and normalizes %s', async (method, Command) => {
    const controller = createController();
    const request = {
      userId: '42',
      fileIds: ['AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'],
      operationId: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB',
    };
    await expect(controller[method](request)).resolves.toEqual({});
    expect(commandBus.execute).toHaveBeenCalledWith(
      new Command({
        userId: 42,
        fileIds: request.fileIds.map((id) => id.toLowerCase()),
        operationId: request.operationId.toLowerCase(),
      }),
    );
    commandBus.execute.mockClear();
    await expect(controller[method]({ ...request, operationId: 'invalid' })).rejects.toThrow();
    await expect(controller[method]({ ...request, fileIds: ['invalid'] })).rejects.toThrow();
    expect(commandBus.execute).not.toHaveBeenCalled();
  });
});

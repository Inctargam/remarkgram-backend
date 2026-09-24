import { RpcException } from '@nestjs/microservices';
import { AttachAvatarUploadCommand } from '../../application/use-cases/attach-avatar-upload/attach-avatar-upload.use-case.js';
import { ScheduleAttachedFileDeletionCommand } from '../../application/use-cases/schedule-attached-file-deletion/schedule-attached-file-deletion.use-case.js';
import { FilesGrpcController } from './files-grpc.controller.js';
import { ImageContentType } from '@app/files-grpc';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AttachReservedImageUploadsCommand } from '../../application/use-cases/attach-reserved-image-uploads/attach-reserved-image-uploads.use-case.js';
import { CompleteImageUploadsCommand } from '../../application/use-cases/complete-image-uploads/complete-image-uploads.use-case.js';
import { InitiateImageUploadsCommand } from '../../application/use-cases/initiate-image-uploads/initiate-image-uploads.use-case.js';
import { InitiateAvatarUploadCommand } from '../../application/use-cases/initiate-avatar-upload/initiate-avatar-upload.use-case.js';
import { ReleaseReservedImageUploadsCommand } from '../../application/use-cases/release-reserved-image-uploads/release-reserved-image-uploads.use-case.js';
import { ReserveImageUploadsCommand } from '../../application/use-cases/reserve-image-uploads/reserve-image-uploads.use-case.js';

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
    await expect(controller.attachAvatarUpload({ userId: '42', fileId, operationId })).resolves.toEqual({});
    expect(commandBus.execute).toHaveBeenCalledWith(
      new AttachAvatarUploadCommand({
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
      controller.attachAvatarUpload({ userId: '42', fileId: 'bad', operationId: 'bad' }),
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

  it('delegates image upload reservation to the use case', async () => {
    const controller = createController();
    const request = {
      userId: '42',
      uploadIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
      reservationId: '33333333-3333-4333-8333-333333333333',
    };
    commandBus.execute.mockResolvedValue(undefined);

    await expect(controller.reserveImageUploads(request)).resolves.toEqual({});

    expect(commandBus.execute).toHaveBeenCalledWith(
      new ReserveImageUploadsCommand({
        userId: 42,
        uploadIds: request.uploadIds,
        reservationId: request.reservationId,
      }),
    );
  });

  it('delegates release of reserved image uploads to the use case', async () => {
    const controller = createController();
    const request = {
      userId: '42',
      reservationId: '33333333-3333-4333-8333-333333333333',
    };
    commandBus.execute.mockResolvedValue(undefined);

    await expect(controller.releaseReservedImageUploads(request)).resolves.toEqual({});

    expect(commandBus.execute).toHaveBeenCalledWith(
      new ReleaseReservedImageUploadsCommand({
        userId: 42,
        reservationId: request.reservationId,
      }),
    );
  });

  it('delegates attachment of reserved image uploads to the use case', async () => {
    const controller = createController();
    const request = {
      userId: '42',
      reservationId: '33333333-3333-4333-8333-333333333333',
    };
    commandBus.execute.mockResolvedValue(undefined);

    await expect(controller.attachReservedImageUploads(request)).resolves.toEqual({});

    expect(commandBus.execute).toHaveBeenCalledWith(
      new AttachReservedImageUploadsCommand({
        userId: 42,
        reservationId: request.reservationId,
      }),
    );
  });
});

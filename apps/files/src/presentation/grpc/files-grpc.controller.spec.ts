import { FilesGrpcController } from './files-grpc.controller.js';
import { ImageContentType } from '@app/files-grpc';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AttachReservedImageUploadsCommand } from '../../application/use-cases/attach-reserved-image-uploads/attach-reserved-image-uploads.use-case.js';
import { CompleteImageUploadsCommand } from '../../application/use-cases/complete-image-uploads/complete-image-uploads.use-case.js';
import { InitiateImageUploadsCommand } from '../../application/use-cases/initiate-image-uploads/initiate-image-uploads.use-case.js';
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

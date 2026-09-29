import { PaymentsGrpcController } from './payments-grpc.controller.js';

describe('PaymentsGrpcController', () => {
  let controller: PaymentsGrpcController;

  beforeEach(() => {
    controller = new PaymentsGrpcController();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
  it('check the result of  createPayment call', async () => {
    await expect(controller.createPayment()).resolves.toEqual({});
  });
});

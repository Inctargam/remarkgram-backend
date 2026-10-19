import { PaymentsRpcExceptionFilter } from './payments-rpc-exception.filter.js';

describe('PaymentsRpcExceptionFilter', () => {
  let filter: PaymentsRpcExceptionFilter;

  beforeEach(() => {
    filter = new PaymentsRpcExceptionFilter();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });
});

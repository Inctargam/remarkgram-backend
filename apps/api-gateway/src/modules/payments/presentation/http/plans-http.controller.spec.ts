import { Reflector } from '@nestjs/core';
import type { ClientGrpc } from '@nestjs/microservices';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Public } from '../../../../common/http/decorators/public.decorator.js';
import { PlansHttpController } from './plans-http.controller.js';

describe(PlansHttpController.name, () => {
  const getPlans = vi.fn();
  const controller = new PlansHttpController({
    getService: vi.fn(() => ({ getPlans })),
  } as unknown as ClientGrpc);

  it('is public and returns the public plan list', async () => {
    const plans = [{ id: 1, price: 999, currency: 'USD', periodCount: 1, periodUnit: 'MONTH' }];
    getPlans.mockReturnValue(of({ items: plans }));
    controller.onModuleInit();

    await expect(controller.getPlans()).resolves.toEqual(plans);
    expect(getPlans).toHaveBeenCalledWith({});
    expect(new Reflector().get(Public, PlansHttpController)).toBe(true);
  });
});

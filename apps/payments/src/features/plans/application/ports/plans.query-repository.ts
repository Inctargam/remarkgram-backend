export type PlanView = {
  id: number;
  price: number;
  currency: string;
  periodCount: number;
  periodUnit: string;
};

export abstract class PlansQueryRepository {
  abstract findAll(): Promise<PlanView[]>;
}

export class MissingDbosWorkflowContextError extends Error {
  constructor() {
    super('Payment webhook workflow was invoked without a DBOS workflow context');
    this.name = new.target.name;
  }
}

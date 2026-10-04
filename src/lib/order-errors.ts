export class OrderRequestError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

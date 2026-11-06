/** A business-rule violation whose message is safe to show to the user. */
export class DomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DomainError";
  }
}

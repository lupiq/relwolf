export class UpdaterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpdaterError';
  }
}

export class ConcurrencyLimiter {
  private inFlight = 0;

  constructor(private readonly maxConcurrent: number) {
    if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new Error('maxConcurrent must be a positive integer');
    }
  }

  get active(): number {
    return this.inFlight;
  }

  tryEnter(): boolean {
    if (this.inFlight >= this.maxConcurrent) {
      return false;
    }
    this.inFlight += 1;
    return true;
  }

  leave(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  async run<T>(work: () => Promise<T>, onBusy: () => never): Promise<T> {
    if (!this.tryEnter()) {
      onBusy();
    }
    try {
      return await work();
    } finally {
      this.leave();
    }
  }
}

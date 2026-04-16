/** Linear browser history with back/forward indices */
export class NavHistory {
  private items: string[] = [];
  private index = -1;

  go(slug: string): void {
    this.items = this.items.slice(0, this.index + 1);
    this.items.push(slug);
    this.index = this.items.length - 1;
  }

  current(): string | undefined {
    return this.items[this.index];
  }

  back(): string | undefined {
    if (this.index <= 0) return undefined;
    this.index -= 1;
    return this.items[this.index];
  }

  forward(): string | undefined {
    if (this.index >= this.items.length - 1) return undefined;
    this.index += 1;
    return this.items[this.index];
  }

  reset(slug: string): void {
    this.items = [slug];
    this.index = 0;
  }
}

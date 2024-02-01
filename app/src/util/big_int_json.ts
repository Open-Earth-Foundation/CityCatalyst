Object.defineProperty(BigInt.prototype, "toJSON", {
  get() {
    return () => this.toString();
  },
  configurable: true,
});

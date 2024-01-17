Object.defineProperty(BigInt.prototype, "toJSON", {
  get() {
    return () => this.toString();
  },
});

const BigIntTools = {};
export default BigIntTools;

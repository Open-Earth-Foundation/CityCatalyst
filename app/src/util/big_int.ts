// Original Source: https://gist.github.com/wchargin/93062064e1ec0e3383b91b921da86048
// Was merged into https://github.com/sourcecred/sourcecred, which is MIT- and Apache-licensed

// Tests and discussion at:
// <https://github.com/sourcecred/sourcecred/pull/1715#issuecomment-603354146>

/**
 * For a finite normal 64-bit float `f`, extracts integers `sgn`,
 * `exponent`, and `mantissa` such that:
 *
 *   - `sgn` is -1 or +1
 *   - `exponent` is between -1023 and 1024, inclusive
 *   - `mantissa` is between 0 and 2^51 - 1, inclusive
 *   - the number given by `f` equals `sgn * 2^exponent * (1 + mantissa / 2^52)`
 *
 * The results are all bigints within the range of safe integers for
 * 64-bit floats (i.e., converting them to `Number` is lossless).
 *
 * Throws an error if `f` is subnormal (biased exponent is 0).
 */
function decomposeFloat(f: number) {
  if (!isFinite(f)) {
    throw new Error("Input must be finite: " + f);
  }
  const union = new DataView(new ArrayBuffer(8));
  const littleEndian = true; // arbitrary, but faster when matches native arch
  union.setFloat64(0, f, littleEndian);
  const bytes = union.getBigUint64(0, littleEndian);
  const sgn = (-1n) ** (bytes >> 63n);
  const biasedExponent = (bytes & ~(1n << 63n)) >> 52n;
  if (biasedExponent === 0n) {
    throw new Error("Subnormal floats not supported: " + f);
  }
  const exponent = biasedExponent - 1023n;
  const mantissa = bytes & ((1n << 52n) - 1n);
  return { sgn, exponent, mantissa };
}

/**
 * Multiply an exact bigint by a floating point number.
 *
 * This function is exact in the first argument and subject to the usual
 * floating point considerations in the second. Thus, it is the case
 * that
 *
 *      multiplyFloat(g, 1) === g
 *      multiplyFloat(g, x) + multiplyFloat(h, f) === multiplyFloat(g + h, x)
 *      multiplyFloat(k * g, x) === k * multiplyFloat(g, x)
 *
 * for all `BigInt`s `k`, `g`, and `h` and all floats `x`. But it is not
 * necessarily the case that
 *
 *      multiplyFloat(g, x) + multiplyFloat(g, y) === multiplyFloat(g, x + y)
 *
 * for all `BigInt`s `g` and floats `x` and `y`: e.g., when `x === 1`
 * and `y === 1e-16`, we have `x + y === x` even though `y !== 0`.
 */
export function multiplyBigIntFloat(g: bigint, fac: number): bigint {
  if (fac === 0) {
    // Special case, as 0 is subnormal.
    return 0n;
  }
  const { sgn, exponent, mantissa } = decomposeFloat(fac);
  // from `decomposeFloat` contract, `fac = numerator / denominator`
  // exactly (in arbitrary-precision arithmetic)
  const numerator = sgn * 2n ** (exponent + 1023n) * (2n ** 52n + mantissa);
  const denominator = 2n ** (1023n + 52n);
  // round to nearest, biasing toward zero on exact tie
  return (2n * numerator * g + sgn * denominator) / (2n * denominator);
}

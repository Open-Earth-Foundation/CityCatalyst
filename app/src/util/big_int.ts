import Decimal from "decimal.js";

export function decimalToBigInt(decimal: Decimal): bigint {
  return BigInt(decimal.trunc().toString());
}

export function bigIntToDecimal(bigIntValue: bigint): Decimal {
  return new Decimal(bigIntValue.toString());
}

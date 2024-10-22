import Decimal from "decimal.js";

export function decimalToBigInt(decimal: Decimal): bigint {
  // Convert the Decimal to a string
  const decimalString = decimal.toString();

  // Remove any decimal point and trailing zeros
  const integerString = decimalString.replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");

  // Convert to BigInt
  return BigInt(integerString);
}

export function bigIntToDecimal(bigIntValue: bigint): Decimal {
  return new Decimal(bigIntValue.toString());
}

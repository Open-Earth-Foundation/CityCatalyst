export function estimate(
  series: { year: number; value: number }[],
  year: number,
): number | null {
  // if it's in the series, just return the value

  const exact = series.find((e) => e.year === year);
  if (exact) {
    return exact.value;
  }

  // we need at least two points to interpolate or extrapolate

  if (series.length < 2) {
    return null;
  }

  if (year < series[0].year) {
    // extrapolate backwards
    const first = series[0];
    const next = series.find((e) => e.year - first.year >= first.year - year);
    if (!next) {
      return null;
    }
    const rate = (next.value - first.value) / (next.year - first.year);
    const value = first.value - rate * (first.year - year);
    return value;
  } else if (year > series[series.length - 1].year) {
    // extrapolate forwards
    const last = series[series.length - 1];
    const prev = series.findLast((e) => last.year - e.year >= year - last.year);
    if (!prev) {
      return null;
    }
    const rate = (last.value - prev.value) / (last.year - prev.year);
    const value = last.value + rate * (year - last.year);
    return value;
  } else {
    // interpolate
    const prev = series.findLast((e) => e.year < year);
    const next = series.find((e) => e.year > year);
    if (!prev || !next) {
      return null;
    }
    const rate = (next.value - prev.value) / (next.year - prev.year);
    const value = prev.value + rate * (year - prev.year);
    return value;
  }

  return null;
}

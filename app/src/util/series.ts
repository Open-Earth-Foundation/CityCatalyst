export function estimate(series: { year: number, value: number }[], year: number): number | null {

  // if it's in the series, just return the value

  const exact = series.find(e => e.year === year);
  if (exact) {
    return exact.value;
  }

  // we need at least two points to interpolate or extrapolate

  if (series.length < 2) {
    return null;
  }

  if (year < series[0].year) { // extrapolate backwards
    let first = series[0]
    let next = series.find(e => e.year - first.year >= first.year - year)
    if (!next) {
      return null
    }
    let rate = (1.0 * (next.value - first.value)) / (next.year - first.year);
    let value = first.value - rate * (first.year - year)
    return Math.round(value)
  } else if (year > series[series.length - 1].year) { // extrapolate forwards
    let last = series[series.length - 1]
    let prev = series.findLast(e => last.year - e.year >= year - last.year)
    if (!prev) {
      return null
    }
    let rate = (1.0 * (last.value - prev.value)) / (last.year - prev.year);
    let value = last.value + rate * (year - last.year)
    return Math.round(value)
  } else { // interpolate
    let prev = series.findLast(e => e.year < year)
    let next = series.find(e => e.year > year)
    if (!prev || !next) {
      return null
    }
    let rate = (1.0 * (next.value - prev.value)) / (next.year - prev.year);
    let value = prev.value + rate * (year - prev.year)
    return Math.round(value)
  }

  return null;
}
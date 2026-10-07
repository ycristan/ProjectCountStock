// Weight count rule: a fraction of 0.7 or more rounds up, otherwise down.
// The fraction is rounded to 6 places so an exact .7 (e.g. 1070 g / 100 g = 10.7)
// is not read as 0.69999… and rounded down by floating-point error.
// The team flow database recomputes weighed counts with the same rule.
export function weightUnits(raw: number): number {
  if (!(raw > 0)) return 0
  const decimal = Math.round((raw - Math.floor(raw)) * 1e6) / 1e6
  return decimal >= 0.7 ? Math.ceil(raw) : Math.floor(raw)
}

export function convertCount(
  pallets: number,
  cases: number,
  units: number,
  bpu: number,
  palletSize: number
): { finalCases: number; finalUnits: number } {
  const totalUnits = pallets * palletSize * bpu + cases * bpu + units
  return {
    finalCases: Math.floor(totalUnits / bpu),
    finalUnits: totalUnits % bpu,
  }
}

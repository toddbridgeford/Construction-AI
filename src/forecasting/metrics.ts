export const rmse = (actual: number[], predicted: number[]): number => {
  if (!actual.length || actual.length !== predicted.length) return Number.POSITIVE_INFINITY
  const mse =
    actual.reduce((sum, value, index) => {
      const error = value - predicted[index]
      return sum + error * error
    }, 0) / actual.length
  return Number(Math.sqrt(mse).toFixed(4))
}

export const mae = (actual: number[], predicted: number[]): number => {
  if (!actual.length || actual.length !== predicted.length) return Number.POSITIVE_INFINITY
  const meanAbsoluteError =
    actual.reduce((sum, value, index) => {
      return sum + Math.abs(value - predicted[index])
    }, 0) / actual.length
  return Number(meanAbsoluteError.toFixed(4))
}

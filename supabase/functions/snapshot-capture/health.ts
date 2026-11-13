export function expectedPortfoliosAreSatisfied(
  expectedPortfolioIds: readonly string[],
  snapshotPortfolioIds: readonly string[],
  skippedPortfolioIds: readonly string[],
) {
  const satisfiedPortfolioIds = new Set([
    ...snapshotPortfolioIds,
    ...skippedPortfolioIds,
  ])

  return expectedPortfolioIds.every((portfolioId) =>
    satisfiedPortfolioIds.has(portfolioId)
  )
}

export function shouldLoadNextPortfolioPage(
  pageLength: number,
  pageSize: number,
) {
  return pageLength === pageSize
}

// Public API of the analytics feature — other modules import only from here (lint-enforced).
export { Analyses, type AnalysisView } from './Analyses'
export { EvolutionCard } from './EvolutionCard'
export { buildMonthlySeries, monthKey, monthWindow } from './series'
export { useMonthlyData, type CategorySummary } from './useMonthlyData'

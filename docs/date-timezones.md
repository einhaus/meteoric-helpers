# Explicit timezone conversion in the date helpers

## Contract

`getDateFromUnix`, `getDate({ timezone })`, and `getDateFromUtc` share one cached `Intl.DateTimeFormat` wall-clock reader. They do not parse a target-zone wall clock through the process zone. The calendar surrogate used for formatting is kept separate from the actual instant.

- `getDate` numeric input and `getDateFromUnix` input are Unix **seconds**. `getDateFromUtc` numeric input is **milliseconds**.
- `getDate` returns Unix seconds as a **string**; `getDateFromUtc(..., 'unix')` returns a **number**. A display-zone change alone cannot change either instant, or the `iso` result.
- `getDate` `startOf`/`endOf` operate in the requested zone, in that order. Each resulting boundary uses the offset at the boundary, including 23-hour and 25-hour days. ISO offsets reflect that boundary.
- Existing parsing is preserved: a timezone-free string passed to `getDate` is still parsed in the process zone. The timezone option converts an already parsed instant; it does not declare the input string's zone. `getDateFromUtc` still interprets timezone-free input as UTC.
- `getDate` arithmetic still happens before conversion, in the input/process zone. Changing that order is outside this fix.
- With no zone, `getDate` and `getDateFromUnix` still use the process zone; `getDateFromUtc` still uses UTC. This preserves the protected observation adapter's identity contract.
- Existing format strings, return types and invalid-date behavior are retained. The pre-existing explicit-date `getDate({ format: 'yyyy', date: ... })` empty-string behavior is not repaired by this timezone change.

## Reproduced correction

| Process zone | Input instant | Output | Before | After |
| --- | --- | --- | --- | --- |
| Europe/London | `1774762200` seconds | Eastern wall clock | `2026-03-29 02:30:00` | `2026-03-29 01:30:00` |
| Europe/London | `1774762200` seconds | Unix seconds | `1774765800` | `1774762200` |
| Europe/London | `1774762200` seconds | ISO instant | `2026-03-29T06:30:00.000Z` | `2026-03-29T05:30:00.000Z` |
| Australia/Sydney | `1791095400` seconds | Eastern wall clock | `2026-10-04 03:30:00` | `2026-10-04 02:30:00` |
| Australia/Sydney | `1791095400` seconds | Unix seconds | `1791099000` | `1791095400` |

## Caller inventory (2026-11-12)

Inventory covers imported `getDate` calls with a timezone and every imported `getDateFromUtc` call in the three repositories' `src` trees, excluding tests and comments. TypeScript was transpiled and its call expressions parsed. All spread-config `getDate` calls were inspected; none supplies a timezone. Counts: backend **99** (63 `getDate`, 36 `getDateFromUtc`), frontend **8** (6/2), shared **2** (2/0). Counts include operator scripts and four UTC-default `getDateFromUtc` calls.

Frontend callers execute in the viewer's browser zone. Backend services are Bun/core paths; `ecosystem.config.cjs` directly identifies gateway, entryMonitor and alpacaFirehose ownership. Scripts/utilities inherit the operator's process zone. Shared helpers inherit their consumer's runtime; the futures coverage helpers are used by backend repositories. This source inventory does not attest which dormant methods or historical repair scripts are deployed or invoked.

The core host's Eastern zone is documented in backend `docs/patterns/DATETIME_HANDLING.md`; PM2 does not pin `TZ`. No live process zone was inspected. `CRON_TZ` establishes schedule timing, not child-process conversion behavior. Rust runtimes do not execute this TypeScript helper.

The browser's Idea Lab review uses `getDate` for chart markers and query-window strings, so the correction can affect those strings for London/Sydney viewers at the demonstrated timestamps. Date-only comparisons keep their date in the demonstrated 01:30/02:30 cases. UTC-target callers bypassed the old reparsing problem and should remain unchanged. Portfolio display callers keep their existing input-string interpretation.

Paths below are relative to each repository. NY = `America/New_York`, CT = `America/Chicago`, UTC = `Etc/UTC`. The sampled helper outputs were unchanged in Eastern and UTC processes in the bounded compatibility sweep below. Individual live calls, historical stored data and deployment configurations were not attested.

| Repository / path | getDate | getDateFromUtc | Requested zone(s) | Runtime |
| --- | ---: | ---: | --- | --- |
| `frontend/src/components/Chart/microtrendComparisonDisplay.ts` | 0 | 2 | NY | Browser / viewer zone |
| `frontend/src/features/strategyBacktests/futuresConfigurationDraft.ts` | 1 | 0 | UTC | Browser / viewer zone |
| `frontend/src/pages/User/IdeaLab/IdeaLabEntryReview.tsx` | 1 | 0 | NY | Browser / viewer zone |
| `frontend/src/pages/User/Portfolio/components/PerformanceGlanceCard.tsx` | 1 | 0 | NY | Browser / viewer zone |
| `frontend/src/pages/User/Portfolio/components/PortfolioSummaryCard.tsx` | 1 | 0 | NY | Browser / viewer zone |
| `frontend/src/pages/User/PortfolioPerformance/PortfolioPerformance.tsx` | 1 | 0 | NY | Browser / viewer zone |
| `frontend/src/pages/User/StrategyLeaderboard/strategyLeaderboardFilters.ts` | 1 | 0 | NY | Browser / viewer zone |
| `shared/src/tradingHelpers/futuresDataCoverage.ts` | 2 | 0 | NY, UTC | Consumer runtime (backend coverage) |
| `backend/src/brokerage/providers/alpaca/AlpacaBrokerProvider.ts` | 2 | 0 | UTC | Bun backend / inherited process zone |
| `backend/src/classes/request/AlpacaApi.ts` | 6 | 0 | UTC | Bun backend / inherited process zone |
| `backend/src/classes/technicalAnalysis/HorizontalSwingLevelFinder.ts` | 2 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/entities/asset/AssetManager.ts` | 2 | 6 | NY, UTC | Bun backend / inherited process zone |
| `backend/src/entities/asset/AssetsRepository.ts` | 1 | 1 | NY | Bun backend / inherited process zone |
| `backend/src/entities/cryptocurrency/CoinbaseDailyVolumeRepository.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/entities/cryptocurrency/CryptocurrenciesRepository.ts` | 0 | 2 | NY | Bun backend / inherited process zone |
| `backend/src/helpers/RutIndexResearchPreflight.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/helpers/assets/alpacaBackfillLookup.ts` | 0 | 1 | NY | Bun backend / inherited process zone |
| `backend/src/helpers/assets/financialStatementHistoryMapping.ts` | 0 | 1 | NY | Bun backend / inherited process zone |
| `backend/src/helpers/brokerConnectionReauthorization.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/helpers/databento/DatabentoIndexRecovery.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/helpers/futures/FuturesMaintenanceCalendar.ts` | 0 | 1 | CT | Bun backend / inherited process zone |
| `backend/src/helpers/market/alpacaDualScaleBars.ts` | 0 | 1 | NY | Bun backend / inherited process zone |
| `backend/src/helpers/market/coinbaseMinuteBars.ts` | 0 | 1 | NY | Bun backend / inherited process zone |
| `backend/src/helpers/market/dailyBarCompletion.ts` | 0 | 2 | NY | Bun backend / inherited process zone |
| `backend/src/helpers/trading/portfolioDailyPerformance.ts` | 1 | 0 | PORTFOLIO_PERFORMANCE_TIMEZONE | Bun backend / inherited process zone |
| `backend/src/helpers/trading/resolveExecutionContractMultiplier.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/jobs/classes/JobsAssets.ts` | 3 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/jobs/classes/JobsCrypto.ts` | 2 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/jobs/classes/JobsData.ts` | 0 | 4 | (UTC default) | Bun backend / inherited process zone |
| `backend/src/jobs/classes/JobsScreener.ts` | 2 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/jobs/classes/JobsUtilities.ts` | 1 | 0 | UTC | Bun backend / inherited process zone |
| `backend/src/jobs/classes/helpers/MarketRegimeModelMaintenance.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/jobs/classes/helpers/OratsIndexOptionHistoryBackfill.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/repositories/AssetRawBasisCorrectionRepository.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/repositories/FuturesMaintenanceRepository.ts` | 0 | 1 | NY | Bun backend / inherited process zone |
| `backend/src/repositories/IndexOptionRepository.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/repositories/PortfolioPerformanceRepository.ts` | 1 | 0 | PORTFOLIO_PERFORMANCE_TIMEZONE | Bun backend / inherited process zone |
| `backend/src/scripts/audit-experiment-outcome-bounds.ts` | 0 | 1 | NY | Operator process |
| `backend/src/scripts/audit-sec-share-sources.ts` | 0 | 1 | NY | Operator process |
| `backend/src/scripts/backfillAlpacaRaw1mBars.ts` | 2 | 1 | NY, UTC | Operator process |
| `backend/src/scripts/repairAhlPriceAcceptance20261016.ts` | 0 | 3 | NY | Operator process |
| `backend/src/scripts/replaceArch20210916Bars.ts` | 0 | 3 | NY | Operator process |
| `backend/src/services/alpacaFirehose/AlpacaFirehoseService.ts` | 0 | 2 | NY | Bun backend / inherited process zone |
| `backend/src/services/assets/AssetFinancialStatementHistoryImportService.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/services/assets/AssetHistoricalSharesImportService.ts` | 0 | 1 | NY | Bun backend / inherited process zone |
| `backend/src/services/assets/EconomicCalendarImportService.ts` | 3 | 0 | NY, UTC | Bun backend / inherited process zone |
| `backend/src/services/assets/secHistoricalSharesFilingHelpers.ts` | 0 | 1 | NY | Bun backend / inherited process zone |
| `backend/src/services/assets/secHistoricalSharesHelpers.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/services/brokerage/BrokerConnectionAuthHealthService.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/services/brokerage/SchwabExternalFlowService.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/services/brokerage/schwabOptionSettlementEvidence.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/services/entryMonitor/EntryMonitorService.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/services/ideaLab/IdeaLabPromotionService.ts` | 2 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/services/marketData/LegacyPriceReferenceService.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/services/mcp/Project314McpStrategyCapabilityTools.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/services/microtrendComparison/comparisonCore.ts` | 0 | 1 | NY | Bun backend / inherited process zone |
| `backend/src/services/portfolioBacktests/helpers/universeScreenerPassingDates.ts` | 2 | 0 | EASTERN_TIMEZONE | Bun backend / inherited process zone |
| `backend/src/services/portfolioBacktests/portfolioBacktestRefreshPolicy.ts` | 3 | 0 | NY, UTC | Bun backend / inherited process zone |
| `backend/src/services/regimeProfile/RegimeDependenceProfileService.ts` | 2 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/services/scorecards/ScorecardBaselineService.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/services/trading/FuturesPaperService.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/services/trading/MnqPaperExecutionService.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/services/trading/MnqPaperIdentity.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/services/trading/MnqPaperMarketData.ts` | 2 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/services/trading/mnqPaperRuntimeContext.ts` | 1 | 0 | NY | Bun backend / inherited process zone |
| `backend/src/utilities/assets/alpaca-backfillCanonical1mBars.ts` | 2 | 0 | UTC | Operator process |
| `backend/src/utilities/assets/alpaca-fetchAssetBarsForTimeRange.ts` | 0 | 1 | NY | Operator process |

`EASTERN_TIMEZONE` and `PORTFOLIO_PERFORMANCE_TIMEZONE` resolve to `America/New_York` in their owning modules.

## Validation and release limits

- Date tests run each regression in UTC, New York, Chicago, Los Angeles, London and Sydney processes. They cover formats, explicit offsets, fractional seconds, numeric units, invalid inputs, both DST transitions, calendar boundaries and preserved local parsing/arithmetic.
- Helper full suite: 461 passed, 10 pre-existing skips. Helper type-check, build, changed-file lint/format and diff checks passed.
- A bounded before/after sweep used 05:30/06:30 UTC on every day of 2026, three target zones, selected output formats, no-zone calls and boundary cases: 13,212 comparisons per process zone. Eastern and UTC processes had zero changes. London/Sydney changes were the demonstrated one-hour corrections. This is a regression sample, not exhaustive historical timezone coverage.
- Chrome smoke checks passed in New York, UTC, Los Angeles, London and Sydney browser zones. The helper was bundled from the isolated build.
- Backend, frontend and shared-package type-checks passed with temporary compiler paths pointing at the isolated helper declarations. The protected adapter's 24 tests passed against that helper build, retaining its literal Eastern/UTC identities.
- The frontend Vite bundle passed with an alias to the isolated helper and output outside the checkout. The standard frontend Zod declaration preflight failed against its existing linked helper because `@modelcontextprotocol/sdk/server/mcp.js` was missing; that environment issue was not repaired by this change.

This work builds on `a410939` and remains review-only. No version bump, publish, push, deployment, stored-data repair or main-checkout helper rebuild is included. Before any release consuming the combined helper changes, deploy the adapter protection (`6be1d26e3`) first; then publish the helper and release its consumers through their normal owners.

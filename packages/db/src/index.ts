// Client factories
export { createBrowserClient, createServerClient } from "./client";

// Analysis queries & types
export {
  createAnalysis,
  getAnalysis,
  updateAnalysisStatus,
  listAnalyses,
} from "./queries/analyses";
export type {
  Analysis,
  AnalysisPreferences,
  AnalysisSection,
} from "./queries/analyses";

// Section queries & types
export {
  createSections,
  getSection,
  updateSectionStatus,
  updateSectionOutput,
} from "./queries/sections";
export type {
  Section,
  SectionConfig,
  SectionExtraFields,
} from "./queries/sections";

// Scrape queries & types
export {
  insertRawEvents,
  getCachedScrape,
  insertScrapeJob,
  updateScrapeJob,
} from "./queries/scrape";
export type {
  RawEvent,
  RawEventRow,
  ScrapeJob,
  CachedScrapeRow,
} from "./queries/scrape";

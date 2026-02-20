// ---------------------------------------------------------------------------
// Engine module exports
// ---------------------------------------------------------------------------

export { CrossReferenceEngine } from './cross-reference.js';
export type { CrossingMatch, EmergentPattern } from './cross-reference.js';

export { OpportunityGenerator } from './opportunity-generator.js';
export type { GeneratedOpportunity } from './opportunity-generator.js';

export { OpportunityDeduplicator } from './dedup.js';
export type { DedupResult } from './dedup.js';

export { FeedbackLoop } from './feedback.js';
export type { FeedbackEvent } from './feedback.js';

export { IntelligencePipeline } from './pipeline.js';
export type { PipelineResult } from './pipeline.js';

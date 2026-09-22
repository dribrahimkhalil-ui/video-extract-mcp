import { createHash } from 'node:crypto';

export type InboxKind = 'url' | 'video' | 'audio' | 'image' | 'pdf' | 'document' | 'text';
export type ProcessingState = 'New' | 'Processing' | 'Reviewed' | 'Actioned' | 'Archived';
export type Decision = 'Adopt' | 'Experiment' | 'Reference' | 'Ignore';
export type Classification = 'Knowledge' | 'Tool' | 'Workflow' | 'Source' | 'Policy' | 'Other';
export type EvidenceQuality = 'low' | 'low-medium' | 'medium' | 'high';

export interface RawInboxItem {
  rawItemId: string;
  kind: InboxKind;
  originalUrl?: string;
  content?: string;
  artifactPath?: string;
  capturedAt: string;
  relatedRawItemIds?: string[];
  contentSha256?: string;
}

export interface UrlIdentity {
  originalUrl: string;
  canonicalUrl: string;
  platform: string | null;
  contentId: string | null;
  creator: string | null;
  removedTrackingParameters: string[];
}

export interface EvidenceClaim {
  claim: string;
  sourceRawItemIds: string[];
  authority: 'discovery' | 'authoritative' | 'unknown';
  untrustedContent: boolean;
}

export interface ReferenceRecord {
  referenceId: string;
  createdAt: string;
  updatedAt: string;
  processingState: ProcessingState;
  identity: { title: string; creator: string | null; sourceKind: InboxKind; url: UrlIdentity | null };
  provenance: { rawItemIds: string[]; rawContentHashes: Record<string, string>; captureMethod: string; traceable: true };
  understanding: { summary: string; claims: EvidenceClaim[]; embeddedContentIsInstructions: false };
  evidence: { quality: EvidenceQuality; authority: 'discovery' | 'authoritative' | 'unknown'; preservedRaw: true };
  classification: { primary: Classification; secondary?: Classification };
  connections: { projectIds: string[]; capability: string | null; conflictWithLockedDecision: boolean; reviewProposal?: string };
  decision: Decision;
  action: { next: string; approvalRequired: boolean };
  duplicateOf?: string;
  associatedMediaRawItemIds: string[];
}

export interface ReusableAsset {
  assetId: string; referenceId: string; type: 'concept' | 'prompt' | 'workflow' | 'template' | 'media';
  title: string; description: string; provenance: string[]; originalArtifactLocation: string | null;
  intendedUse: string; projects: string[]; verificationStatus: 'unverified' | 'verified';
  proposedDestination: string | null; approvalRequired: boolean; status: 'Proposed' | 'Approved' | 'Archived';
}

export interface FixedSourceCandidate {
  candidateId: string; referenceId: string; sourceUrl: string; reason: string; proposedRole: string;
  approvalRequired: true; approved: boolean; status: 'Candidate' | 'Promoted' | 'Rejected';
}

export interface ImprovementProposal {
  proposalId: string; referenceId: string; title: string; rationale: string; proposedChange: string;
  affectedAreas: string[]; approvalRequired: true; approved: boolean; status: 'Prepared' | 'Approved' | 'Rejected' | 'Applied';
}

const tracking = /^(utm_[^=]+|fbclid|gclid|igshid|si|feature)$/i;
const strip = (value: string): string => value.replace(/^\/+|\/+$/g, '');

export function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 20)}`;
}

export function contentHash(value: string): string { return createHash('sha256').update(value).digest('hex'); }

export function normalizeUrl(originalUrl: string): UrlIdentity {
  const parsed = new URL(originalUrl);
  const removedTrackingParameters: string[] = [];
  for (const [key] of [...parsed.searchParams.entries()]) {
    if (tracking.test(key)) { removedTrackingParameters.push(key); parsed.searchParams.delete(key); }
  }
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) parsed.port = '';
  parsed.pathname = `/${strip(parsed.pathname)}`;
  if (parsed.pathname === '/') parsed.pathname = '/';
  parsed.hash = '';
  const host = parsed.hostname;
  let platform: string | null = null; let contentId: string | null = null; let creator: string | null = null;
  const tiktok = parsed.pathname.match(/^\/@([^/]+)\/video\/(\d+)/i);
  if (host.endsWith('tiktok.com') && tiktok) { platform = 'tiktok'; creator = tiktok[1] ? `@${tiktok[1]}` : null; contentId = tiktok[2] ?? null; }
  const youtube = parsed.searchParams.get('v') ?? (host === 'youtu.be' ? strip(parsed.pathname) : null);
  if (host.endsWith('youtube.com') || host === 'youtu.be') { platform = 'youtube'; contentId = youtube; }
  const instagram = parsed.pathname.match(/^\/(?:reel|p|tv)\/([^/]+)/i);
  if (host.endsWith('instagram.com') && instagram) { platform = 'instagram'; contentId = instagram[1] ?? null; }
  const x = parsed.pathname.match(/^\/[^/]+\/status\/(\d+)/i);
  if ((host === 'x.com' || host.endsWith('twitter.com')) && x) { platform = 'x'; contentId = x[1] ?? null; }
  if (host.endsWith('vimeo.com') && /^\/\d+/.test(parsed.pathname)) { platform = 'vimeo'; contentId = parsed.pathname.slice(1).split('/')[0] ?? null; }
  return { originalUrl, canonicalUrl: parsed.toString(), platform, contentId, creator, removedTrackingParameters };
}

export function findDuplicate(identity: UrlIdentity, existing: ReferenceRecord[]): ReferenceRecord | null {
  return existing.find((r) => r.identity.url && (r.identity.url.originalUrl === identity.originalUrl || r.identity.url.canonicalUrl === identity.canonicalUrl ||
    (!!identity.platform && !!identity.contentId && r.identity.url.platform === identity.platform && r.identity.url.contentId === identity.contentId))) ?? null;
}

export function createReferenceRecord(input: { title: string; sourceKind: InboxKind; rawItems: RawInboxItem[]; url?: string; summary?: string; claims?: string[]; classification: Classification; evidenceQuality: EvidenceQuality; capability?: string; decision?: Decision; now?: string }): ReferenceRecord {
  const now = input.now ?? new Date().toISOString();
  const url = input.url ? normalizeUrl(input.url) : null;
  const rawIds = input.rawItems.map((item) => item.rawItemId);
  const referenceId = stableId('ref', `${url?.canonicalUrl ?? input.title}|${rawIds.join(',')}`);
  const hashes: Record<string, string> = {};
  for (const item of input.rawItems) hashes[item.rawItemId] = item.contentSha256 ?? contentHash(item.content ?? item.originalUrl ?? item.artifactPath ?? item.rawItemId);
  return { referenceId, createdAt: now, updatedAt: now, processingState: 'New',
    identity: { title: input.title, creator: url?.creator ?? null, sourceKind: input.sourceKind, url },
    provenance: { rawItemIds: rawIds, rawContentHashes: hashes, captureMethod: 'reference-inbox-capture-bridge', traceable: true },
    understanding: { summary: input.summary ?? '', claims: (input.claims ?? []).map((claim) => ({ claim, sourceRawItemIds: rawIds, authority: 'discovery', untrustedContent: true })), embeddedContentIsInstructions: false },
    evidence: { quality: input.evidenceQuality, authority: 'discovery', preservedRaw: true },
    classification: { primary: input.classification }, connections: { projectIds: [], capability: input.capability ?? null, conflictWithLockedDecision: false },
    decision: input.decision ?? 'Reference', action: { next: 'Review evidence and provenance', approvalRequired: false }, associatedMediaRawItemIds: input.rawItems.filter((i) => i.kind !== 'url').map((i) => i.rawItemId) };
}

const transitions: Record<ProcessingState, ProcessingState[]> = { New: ['Processing', 'Archived'], Processing: ['Reviewed', 'Archived'], Reviewed: ['Actioned', 'Archived'], Actioned: [], Archived: [] };
export function transitionReference(record: ReferenceRecord, next: ProcessingState, now = new Date().toISOString()): ReferenceRecord {
  if (next !== record.processingState && !transitions[record.processingState].includes(next)) throw new Error(`invalid reference state transition: ${record.processingState} -> ${next}`);
  return { ...record, processingState: next, updatedAt: now };
}

export function createReusableAsset(referenceId: string, input: Omit<ReusableAsset, 'assetId' | 'referenceId' | 'approvalRequired' | 'status'>): ReusableAsset {
  return { ...input, assetId: stableId('asset', `${referenceId}|${input.title}|${input.type}`), referenceId, approvalRequired: true, status: 'Proposed' };
}
export function createFixedSourceCandidate(referenceId: string, sourceUrl: string, reason: string, proposedRole: string): FixedSourceCandidate {
  return { candidateId: stableId('fixed', `${referenceId}|${sourceUrl}`), referenceId, sourceUrl, reason, proposedRole, approvalRequired: true, approved: false, status: 'Candidate' };
}
export function promoteFixedSource(candidate: FixedSourceCandidate, approved: boolean): FixedSourceCandidate {
  if (!approved) throw new Error('explicit approval is required to promote a fixed source');
  return { ...candidate, approved: true, status: 'Promoted' };
}
export function createImprovementProposal(referenceId: string, input: Omit<ImprovementProposal, 'proposalId' | 'referenceId' | 'approvalRequired' | 'approved' | 'status'>): ImprovementProposal {
  return { ...input, proposalId: stableId('improvement', `${referenceId}|${input.title}`), referenceId, approvalRequired: true, approved: false, status: 'Prepared' };
}
export function applyImprovement(proposal: ImprovementProposal, approved: boolean): ImprovementProposal {
  if (!approved) throw new Error('explicit approval is required to apply an improvement proposal');
  return { ...proposal, approved: true, status: 'Applied' };
}
export function evidenceCanAuthorizeAction(_record: ReferenceRecord): false { return false; }
export function markLockedConflict(record: ReferenceRecord, reviewProposal: string): ReferenceRecord {
  return { ...record, connections: { ...record.connections, conflictWithLockedDecision: true, reviewProposal } };
}

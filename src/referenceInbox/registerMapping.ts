import { normalizeUrl, stableId, type ReferenceRecord, type UrlIdentity } from './index.js';
import type { DriveRawInboxItem } from './driveAdapter.js';

export const REGISTER_COLUMNS = [
  'Reference ID', 'Captured At', 'Source Platform', 'Original URL', 'Canonical URL', 'Creator / Publisher', 'Content Available', 'Duplicate Status', 'Main Idea', 'Important Claims', 'Useful Details', 'Why It Matters', 'References Mentioned', 'Original Sources Found', 'Verification Status', 'Evidence Quality', 'Uncertainty / Conflicts', 'Classification', 'Topics / Tags', 'Connected Project', 'Existing Decision / Concept', 'Conflict With Locked Decision', 'ChatGPT Capability', 'Skill / Plugin / Connector', 'MCP / API', 'Build Required', 'Better / Cheaper Alternative', 'Decision', 'Next Action', 'Priority', 'Permanent Destination', 'Status', 'Raw Inbox Item', 'Notes',
] as const;
export type RegisterColumn = typeof REGISTER_COLUMNS[number];
export type RegisterRow = Record<RegisterColumn, string>;
export const UNKNOWN = 'Unknown';

export interface RegisterMappingOptions { duplicateStatus?: string; usefulDetails?: string; whyItMatters?: string; referencesMentioned?: string; originalSourcesFound?: string; verificationStatus?: string; uncertainty?: string; topics?: string; connectedProject?: string; existingDecision?: string; skillPluginConnector?: string; mcpApi?: string; buildRequired?: string; alternative?: string; priority?: string; permanentDestination?: string; notes?: string; }

const text = (value: string | null | undefined): string => value && value.trim() ? value : UNKNOWN;
const driveItems = (record: ReferenceRecord): DriveRawInboxItem[] => [];

export function referenceRecordToRegisterRow(record: ReferenceRecord, rawItems: DriveRawInboxItem[] = driveItems(record), options: RegisterMappingOptions = {}): RegisterRow {
  const url = record.identity.url;
  const drive = rawItems.find((item) => item.drive);
  const claims = record.understanding.claims.map((claim) => claim.claim).join('; ');
  const row = {
    'Reference ID': record.referenceId, 'Captured At': record.createdAt, 'Source Platform': text(url?.platform), 'Original URL': text(url?.originalUrl), 'Canonical URL': text(url?.canonicalUrl), 'Creator / Publisher': text(record.identity.creator), 'Content Available': rawItems.length ? (rawItems.some((item) => item.drive.contentAvailable) ? 'Yes' : 'No') : UNKNOWN, 'Duplicate Status': text(options.duplicateStatus), 'Main Idea': text(record.understanding.summary), 'Important Claims': text(claims), 'Useful Details': text(options.usefulDetails), 'Why It Matters': text(options.whyItMatters), 'References Mentioned': text(options.referencesMentioned), 'Original Sources Found': text(options.originalSourcesFound), 'Verification Status': text(options.verificationStatus), 'Evidence Quality': record.evidence.quality, 'Uncertainty / Conflicts': text(options.uncertainty), 'Classification': record.classification.primary, 'Topics / Tags': text(options.topics), 'Connected Project': text(options.connectedProject ?? record.connections.projectIds.join(', ')), 'Existing Decision / Concept': text(options.existingDecision), 'Conflict With Locked Decision': record.connections.conflictWithLockedDecision ? 'Yes' : 'No', 'ChatGPT Capability': text(record.connections.capability), 'Skill / Plugin / Connector': text(options.skillPluginConnector), 'MCP / API': text(options.mcpApi), 'Build Required': text(options.buildRequired), 'Better / Cheaper Alternative': text(options.alternative), 'Decision': record.decision, 'Next Action': record.action.next, 'Priority': text(options.priority), 'Permanent Destination': text(options.permanentDestination), 'Status': record.processingState, 'Raw Inbox Item': text(drive?.drive.fileId ?? record.provenance.rawItemIds.join(', ')), 'Notes': text(options.notes),
  } satisfies RegisterRow;
  return row;
}

export type MutationKind = 'CREATE' | 'UPDATE' | 'DUPLICATE' | 'NO-OP' | 'CONFLICT';
export interface ExistingRegisterRow { rowNumber: number; values: RegisterRow; expectedIdentity: string; driveFileId?: string; contentHash?: string; }
export interface RegisterMutationProposal { proposalId: string; kind: MutationKind; referenceId: string; rowNumber: number | null; row: RegisterRow; reason: string; provenance: string[]; requiresExplicitWrite: true; matchedBy?: 'reference_id' | 'drive_provenance' | 'canonical_url' | 'platform_content_id'; existingReferenceId?: string; }

function rowUrlIdentity(row: RegisterRow): UrlIdentity | null {
  const url = row['Canonical URL'] !== UNKNOWN ? row['Canonical URL'] : row['Original URL'];
  if (!url || url === UNKNOWN) return null;
  try { return normalizeUrl(url); } catch { return null; }
}

function semanticMatch(record: ReferenceRecord, candidate: ExistingRegisterRow, driveFileId: string | undefined): RegisterMutationProposal['matchedBy'] | 'conflict' | null {
  const candidateUrl = record.identity.url;
  const existingUrl = rowUrlIdentity(candidate.values);
  if (candidate.values['Reference ID'] === record.referenceId) {
    if (candidate.expectedIdentity !== `${record.referenceId}|${driveFileId ?? ''}`) return 'conflict';
    return 'reference_id';
  }
  if (driveFileId && candidate.driveFileId === driveFileId) return 'drive_provenance';
  if (existingUrl && candidateUrl && existingUrl.canonicalUrl === candidateUrl.canonicalUrl) return 'canonical_url';
  if (existingUrl && candidateUrl && existingUrl.platform && existingUrl.contentId && existingUrl.platform === candidateUrl.platform && existingUrl.contentId === candidateUrl.contentId) return 'platform_content_id';
  return null;
}

export function proposeRegisterMutation(record: ReferenceRecord, row: RegisterRow, rawItems: DriveRawInboxItem[], existing: ExistingRegisterRow[] = []): RegisterMutationProposal {
  const driveId = rawItems.find((item) => item.drive)?.drive.fileId;
  const identity = `${record.referenceId}|${driveId ?? ''}`;
  const match = existing.map((candidate) => ({ candidate, match: semanticMatch(record, candidate, driveId) })).find((entry) => entry.match);
  if (match?.match === 'conflict') return { proposalId: stableId('proposal', identity), kind: 'CONFLICT', referenceId: record.referenceId, rowNumber: match.candidate.rowNumber, row, reason: 'existing row contains conflicting identity signals', provenance: record.provenance.rawItemIds, requiresExplicitWrite: true };
  if (match?.match) {
    const candidate = match.candidate;
    const unchanged = REGISTER_COLUMNS.every((column) => candidate.values[column] === row[column]);
    const kind: MutationKind = match.match === 'reference_id' ? (unchanged ? 'NO-OP' : 'UPDATE') : 'DUPLICATE';
    return { proposalId: stableId('proposal', identity), kind, referenceId: record.referenceId, rowNumber: candidate.rowNumber, row: candidate.values, reason: kind === 'NO-OP' ? 'existing mapped row is already identical' : kind === 'UPDATE' ? 'existing stable Reference ID requires mapped-field update' : `semantic duplicate matched by ${match.match}`, provenance: record.provenance.rawItemIds, requiresExplicitWrite: true, matchedBy: match.match, existingReferenceId: candidate.values['Reference ID'] };
  }
  return { proposalId: stableId('proposal', identity), kind: 'CREATE', referenceId: record.referenceId, rowNumber: null, row, reason: 'no stable Reference ID or Drive provenance match exists', provenance: record.provenance.rawItemIds, requiresExplicitWrite: true };
}

export function authorizeRegisterWrite(proposal: RegisterMutationProposal, explicitlyAuthorized: boolean): RegisterMutationProposal {
  if (!explicitlyAuthorized) throw new Error('explicit write authorization is required for each Register mutation');
  if (proposal.kind === 'CONFLICT' || proposal.kind === 'DUPLICATE' || proposal.kind === 'NO-OP') throw new Error(`mutation ${proposal.kind} requires review and cannot be blindly written`);
  return proposal;
}

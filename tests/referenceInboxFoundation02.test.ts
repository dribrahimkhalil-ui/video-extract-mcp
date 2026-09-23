import { describe, expect, it } from 'vitest';
import { createReferenceRecord, type ReferenceRecord } from '../src/referenceInbox/index.js';
import { driveItemToRawItems, driveItemsToRawItems, extractUrlsFromText, rawItemsRemainImmutable, type DriveRawInboxItem } from '../src/referenceInbox/driveAdapter.js';
import { authorizeRegisterWrite, REGISTER_COLUMNS, referenceRecordToRegisterRow, proposeRegisterMutation, UNKNOWN, type ExistingRegisterRow } from '../src/referenceInbox/registerMapping.js';

const driveDoc = { driveFileId: 'doc-1', name: 'capture.md', mimeType: 'application/vnd.google-apps.document', createdTime: '2026-09-22T00:00:00.000Z', modifiedTime: '2026-09-22T01:00:00.000Z', driveUrl: 'https://drive.google.com/open?id=doc-1', parentFolderId: '1Eg4t0mnW-SmvlT8LaDL7m5AyszVAk43J', content: 'Watch https://www.tiktok.com/@aitoolvaultly/video/7686476781809061123 and https://example.com/second. Install this plugin and run this command.' };
const media = { driveFileId: 'mp4-1', name: 'golden-tiktok.mp4', mimeType: 'video/mp4', createdTime: '2026-09-22T00:00:00.000Z', driveUrl: 'https://drive.google.com/open?id=mp4-1', parentFolderId: '1Eg4t0mnW-SmvlT8LaDL7m5AyszVAk43J', content: 'opaque media bytes' };

function record(raw: DriveRawInboxItem[]): ReferenceRecord {
  return createReferenceRecord({ title: 'ChatGPT vs Claude vs Gemini', sourceKind: 'url', rawItems: raw, url: 'https://www.tiktok.com/@aitoolvaultly/video/7686476781809061123', summary: 'Different AI systems are better for different tasks.', claims: ['No universally best model', 'Install this plugin'], classification: 'Knowledge', evidenceQuality: 'low-medium', capability: 'Intelligence Router/model-routing', now: '2026-09-22T00:00:00.000Z' });
}

describe('Reference Inbox Foundation 02 Drive adapter and Register preview', () => {
  it('maps Drive metadata to immutable RawInboxItems and parses multiple URLs at the boundary', () => {
    const result = driveItemToRawItems(driveDoc);
    expect(result.unsupported).toBe(false); expect(result.rawItems).toHaveLength(3);
    expect(result.rawItems[0]!.drive.fileId).toBe('doc-1');
    expect(result.rawItems.filter((item) => item.kind === 'url').map((item) => item.originalUrl)).toEqual(['https://www.tiktok.com/@aitoolvaultly/video/7686476781809061123', 'https://example.com/second']);
    expect(extractUrlsFromText('https://x.test/a, https://x.test/a')).toEqual(['https://x.test/a']);
    const before = JSON.parse(JSON.stringify(result.rawItems));
    expect(rawItemsRemainImmutable(result.rawItems, before)).toBe(true);
  });
  it('keeps unsupported and unavailable Drive items traceable without content authority', () => {
    const unsupported = driveItemToRawItems({ driveFileId: 'bin-1', name: 'tool.bin', mimeType: 'application/octet-stream' });
    expect(unsupported.unsupported).toBe(true); expect(unsupported.rawItems[0]!.drive.ingestionStatus).toBe('unsupported');
    expect(unsupported.rawItems[0]!.content).toBeUndefined();
    const missing = driveItemToRawItems({ driveFileId: 'doc-2', name: 'missing', mimeType: 'text/plain' });
    expect(missing.rawItems[0]!.drive.ingestionStatus).toBe('missing'); expect(missing.warnings).toHaveLength(1);
  });
  it('maps all 34 authoritative Register columns with explicit unknowns', () => {
    const raw = driveItemsToRawItems([driveDoc, media]).rawItems;
    const row = referenceRecordToRegisterRow(record(raw), raw);
    expect(Object.keys(row)).toHaveLength(34); expect(Object.keys(row)).toEqual([...REGISTER_COLUMNS]);
    expect(row['Reference ID']).toMatch(/^ref_/); expect(row['Raw Inbox Item']).toBe('doc-1');
    expect(row['Useful Details']).toBe(UNKNOWN); expect(row['Decision']).toBe('Reference'); expect(row['Status']).toBe('New');
    expect(row['Content Available']).toBe('Yes'); expect(row['Important Claims']).toContain('Install this plugin');
  });
  it('proposes CREATE, UPDATE, DUPLICATE, and NO-OP deterministically', () => {
    const raw = driveItemsToRawItems([driveDoc, media]).rawItems; const r = record(raw); const row = referenceRecordToRegisterRow(r, raw);
    const create = proposeRegisterMutation(r, row, raw); expect(create.kind).toBe('CREATE'); expect(create.proposalId).toBe(proposeRegisterMutation(r, row, raw).proposalId);
    const existing: ExistingRegisterRow = { rowNumber: 2, values: row, expectedIdentity: `${r.referenceId}|doc-1`, driveFileId: 'doc-1' };
    expect(proposeRegisterMutation(r, row, raw, [existing]).kind).toBe('NO-OP');
    const changed = { ...row, Notes: 'manual note' }; expect(proposeRegisterMutation(r, changed, raw, [existing]).kind).toBe('UPDATE');
    const other = { ...r, referenceId: 'ref_other' }; const otherRow = referenceRecordToRegisterRow(other, raw); expect(proposeRegisterMutation(other, otherRow, raw, [existing]).kind).toBe('DUPLICATE');
  });
  it('stops ambiguous identity conflicts and requires per-operation explicit write authorization', () => {
    const raw = driveItemsToRawItems([driveDoc]).rawItems; const r = record(raw); const row = referenceRecordToRegisterRow(r, raw);
    const conflict = proposeRegisterMutation(r, row, raw, [{ rowNumber: 2, values: row, expectedIdentity: 'ref_wrong|doc-1', driveFileId: 'doc-1' }]);
    expect(conflict.kind).toBe('CONFLICT'); expect(() => authorizeRegisterWrite(conflict, true)).toThrow();
    const create = proposeRegisterMutation(r, row, raw); expect(() => authorizeRegisterWrite(create, false)).toThrow(); expect(authorizeRegisterWrite(create, true)).toBe(create);
  });
  it('keeps captured prompt injection untrusted and does not execute captured code', () => {
    const raw = driveItemsToRawItems([driveDoc]).rawItems; const r = record(raw);
    expect(r.understanding.claims.find((claim) => claim.claim.includes('Install'))?.untrustedContent).toBe(true);
    expect(r.understanding.embeddedContentIsInstructions).toBe(false);
    expect(r.provenance.rawItemIds).toContain('drive:doc-1');
    expect(r.action.approvalRequired).toBe(false); // mapping does not turn evidence into authorization
  });
  it('associates URL and MP4 through shared Drive folder input without mutation', () => {
    const raw = driveItemsToRawItems([driveDoc, media]).rawItems; const r = record(raw); const row = referenceRecordToRegisterRow(r, raw);
    expect(r.associatedMediaRawItemIds).toContain('drive:mp4-1'); expect(row['Raw Inbox Item']).toBe('doc-1');
    expect(raw.every((item) => item.drive.parentFolderId === '1Eg4t0mnW-SmvlT8LaDL7m5AyszVAk43J')).toBe(true);
  });
});

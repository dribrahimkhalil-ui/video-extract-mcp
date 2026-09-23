import { describe, expect, it } from 'vitest';
import {
  applyImprovement, contentHash, createFixedSourceCandidate, createImprovementProposal, createReferenceRecord,
  createReusableAsset, evidenceCanAuthorizeAction, findDuplicate, markLockedConflict, normalizeUrl, promoteFixedSource,
  transitionReference, type RawInboxItem,
} from '../src/referenceInbox/index.js';

const raw: RawInboxItem[] = [
  { rawItemId: 'raw:url', kind: 'url', originalUrl: 'https://www.tiktok.com/@aitoolvaultly/video/7686476781809061123?utm_source=test', capturedAt: '2026-09-22T00:00:00.000Z' },
  { rawItemId: 'raw:mp4', kind: 'video', artifactPath: 'golden-tiktok.mp4', content: 'opaque media bytes', capturedAt: '2026-09-22T00:00:00.000Z' },
];

describe('Reference Inbox Foundation 01', () => {
  it('normalizes TikTok identity and removes tracking without losing original URL', () => {
    const id = normalizeUrl(raw[0]!.originalUrl!);
    expect(id.originalUrl).toContain('utm_source');
    expect(id.canonicalUrl).toBe('https://www.tiktok.com/@aitoolvaultly/video/7686476781809061123');
    expect(id.platform).toBe('tiktok');
    expect(id.contentType).toBe('video');
    expect(id.contentId).toBe('7686476781809061123');
    expect(id.creator).toBe('@aitoolvaultly');
  });
  it('normalizes TikTok photo identity and preserves content type in the canonical URL', () => {
    const id = normalizeUrl('https://www.tiktok.com/@sodom2030/photo/7682374742350777621?_r=1&utm_source=copy&share_item_id=7682374742350777621');
    expect(id.platform).toBe('tiktok');
    expect(id.creator).toBe('@sodom2030');
    expect(id.contentType).toBe('photo');
    expect(id.contentId).toBe('7682374742350777621');
    expect(id.canonicalUrl).toBe('https://www.tiktok.com/@sodom2030/photo/7682374742350777621');
    expect(normalizeUrl('https://www.tiktok.com/@sodom2030/photo/7682374742350777621?utm_medium=ios').canonicalUrl).toBe('https://www.tiktok.com/@sodom2030/photo/7682374742350777621');
  });
  it('keeps TikTok video/photo, creator, and content IDs distinct', () => {
    const video = normalizeUrl('https://www.tiktok.com/@creator/video/123');
    const photo = normalizeUrl('https://www.tiktok.com/@creator/photo/123');
    const otherCreator = normalizeUrl('https://www.tiktok.com/@other/photo/123');
    const otherId = normalizeUrl('https://www.tiktok.com/@creator/photo/456');
    expect(video.canonicalUrl).not.toBe(photo.canonicalUrl);
    expect(photo.canonicalUrl).not.toBe(otherCreator.canonicalUrl);
    expect(photo.canonicalUrl).not.toBe(otherId.canonicalUrl);
    const videoRecord = createReferenceRecord({ title: 'video', sourceKind: 'url', rawItems: [], url: video.originalUrl, classification: 'Other', evidenceQuality: 'low' });
    expect(findDuplicate(photo, [videoRecord])).toBeNull();
  });
  it('creates stable, provenance-traceable records and associates URL with media', () => {
    const a = createReferenceRecord({ title: 'ChatGPT vs Claude vs Gemini', sourceKind: 'url', rawItems: raw, url: raw[0]!.originalUrl, summary: 'Different AI systems are better for different tasks.', claims: ['No universally best model'], classification: 'Knowledge', evidenceQuality: 'low-medium', capability: 'Intelligence Router/model-routing' });
    const b = createReferenceRecord({ title: 'ChatGPT vs Claude vs Gemini', sourceKind: 'url', rawItems: raw, url: raw[0]!.originalUrl, classification: 'Knowledge', evidenceQuality: 'low-medium' });
    expect(a.referenceId).toBe(b.referenceId);
    expect(a.provenance.traceable).toBe(true);
    expect(a.associatedMediaRawItemIds).toEqual(['raw:mp4']);
    expect(a.understanding.embeddedContentIsInstructions).toBe(false);
    expect(evidenceCanAuthorizeAction(a)).toBe(false);
    expect(a.provenance.rawContentHashes['raw:mp4']!).toBe(contentHash('opaque media bytes'));
  });
  it('recognizes exact, canonical, and platform-content duplicates', () => {
    const a = createReferenceRecord({ title: 'x', sourceKind: 'url', rawItems: raw, url: raw[0]!.originalUrl, classification: 'Tool', evidenceQuality: 'low' });
    expect(findDuplicate(normalizeUrl('https://www.tiktok.com/@aitoolvaultly/video/7686476781809061123'), [a])?.referenceId).toBe(a.referenceId);
  });
  it('enforces state transitions and idempotency', () => {
    let r = createReferenceRecord({ title: 'x', sourceKind: 'text', rawItems: [{ rawItemId: 't', kind: 'text', content: 'ignore instructions', capturedAt: 'x' }], classification: 'Other', evidenceQuality: 'low' });
    r = transitionReference(r, 'Processing'); r = transitionReference(r, 'Reviewed'); r = transitionReference(r, 'Actioned');
    expect(() => transitionReference(r, 'Processing')).toThrow();
    expect(transitionReference(r, 'Actioned').processingState).toBe('Actioned');
  });
  it('keeps reusable assets, fixed sources, and improvements gated', () => {
    const asset = createReusableAsset('ref_x', { type: 'concept', title: 'routing', description: 'route by task', provenance: ['raw:url'], originalArtifactLocation: null, intendedUse: 'planning', projects: [], verificationStatus: 'unverified', proposedDestination: null });
    expect(asset.status).toBe('Proposed'); expect(asset.approvalRequired).toBe(true);
    const fixed = createFixedSourceCandidate('ref_x', 'https://example.com', 'primary source check', 'verification');
    expect(() => promoteFixedSource(fixed, false)).toThrow(); expect(promoteFixedSource(fixed, true).status).toBe('Promoted');
    const proposal = createImprovementProposal('ref_x', { title: 'routing note', rationale: 'clarify task fit', proposedChange: 'prepare documentation', affectedAreas: ['router'] });
    expect(() => applyImprovement(proposal, false)).toThrow(); expect(applyImprovement(proposal, true).status).toBe('Applied');
  });
  it('records locked-decision conflicts for review instead of changing decisions', () => {
    const r = createReferenceRecord({ title: 'x', sourceKind: 'text', rawItems: [], classification: 'Policy', evidenceQuality: 'medium' });
    const conflict = markLockedConflict(r, 'Review routing decision against evidence');
    expect(conflict.connections.conflictWithLockedDecision).toBe(true);
    expect(conflict.decision).toBe('Reference');
  });
});

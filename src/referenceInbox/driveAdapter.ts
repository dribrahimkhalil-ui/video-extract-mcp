import { contentHash, type InboxKind, type RawInboxItem, type ReferenceRecord } from './index.js';

export interface DriveItemMetadata {
  driveFileId: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
  sourceUrl?: string;
  driveUrl?: string;
  parentFolderId?: string;
  size?: number;
  content?: string;
}

export interface DriveRawInboxItem extends RawInboxItem {
  drive: { fileId: string; name: string; mimeType: string; createdTime: string | null; modifiedTime: string | null; sourceUrl: string | null; driveUrl: string | null; parentFolderId: string | null; size: number | null; contentAvailable: boolean; ingestionStatus: 'available' | 'unsupported' | 'missing' };
}

export interface DriveAdapterResult { rawItems: DriveRawInboxItem[]; warnings: string[]; unsupported: boolean; }

const mimeKinds: Record<string, InboxKind> = {
  'text/plain': 'text', 'text/uri-list': 'text', 'text/markdown': 'text',
  'application/vnd.google-apps.document': 'document', 'application/pdf': 'pdf',
  'video/mp4': 'video', 'video/quicktime': 'video', 'audio/mpeg': 'audio', 'audio/wav': 'audio',
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image',
  'application/msword': 'document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
};

export function extractUrlsFromText(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>()"']+/gi) ?? [];
  return [...new Set(matches.map((url) => url.replace(/[),.;!?]+$/g, '')))];
}

function driveInfo(item: DriveItemMetadata, contentAvailable: boolean, status: DriveRawInboxItem['drive']['ingestionStatus']): DriveRawInboxItem['drive'] {
  return { fileId: item.driveFileId, name: item.name, mimeType: item.mimeType, createdTime: item.createdTime ?? null, modifiedTime: item.modifiedTime ?? null, sourceUrl: item.sourceUrl ?? null, driveUrl: item.driveUrl ?? null, parentFolderId: item.parentFolderId ?? null, size: item.size ?? null, contentAvailable, ingestionStatus: status };
}

export function driveItemToRawItems(item: DriveItemMetadata): DriveAdapterResult {
  const kind = mimeKinds[item.mimeType];
  const capturedAt = item.createdTime ?? item.modifiedTime ?? new Date(0).toISOString();
  if (!kind) {
    return { rawItems: [{ rawItemId: `drive:${item.driveFileId}`, kind: 'document', artifactPath: item.driveUrl, capturedAt, contentSha256: item.content ? contentHash(item.content) : undefined, drive: driveInfo(item, false, 'unsupported') }], warnings: [`unsupported Drive MIME type: ${item.mimeType}`], unsupported: true };
  }
  const base: DriveRawInboxItem = { rawItemId: `drive:${item.driveFileId}`, kind, originalUrl: item.sourceUrl, content: item.content, artifactPath: item.driveUrl, capturedAt, contentSha256: item.content ? contentHash(item.content) : undefined, drive: driveInfo(item, item.content !== undefined, item.content === undefined ? 'missing' : 'available') };
  const urls = kind === 'text' || kind === 'document' ? extractUrlsFromText(item.content ?? '') : [];
  const urlItems: DriveRawInboxItem[] = urls.map((url, index) => ({ rawItemId: `drive:${item.driveFileId}:url:${index}`, kind: 'url', originalUrl: url, capturedAt, relatedRawItemIds: [base.rawItemId], contentSha256: contentHash(url), drive: driveInfo(item, true, 'available') }));
  return { rawItems: [base, ...urlItems], warnings: item.content === undefined ? ['Drive content was not available; metadata preserved'] : [], unsupported: false };
}

export function driveItemsToRawItems(items: DriveItemMetadata[]): DriveAdapterResult {
  return items.reduce<DriveAdapterResult>((all, item) => { const next = driveItemToRawItems(item); return { rawItems: [...all.rawItems, ...next.rawItems], warnings: [...all.warnings, ...next.warnings], unsupported: all.unsupported || next.unsupported }; }, { rawItems: [], warnings: [], unsupported: false });
}

export interface DriveReferenceInput { driveItem: DriveRawInboxItem; reference: ReferenceRecord; }
export function rawItemsRemainImmutable(before: DriveRawInboxItem[], after: DriveRawInboxItem[]): boolean {
  return JSON.stringify(before) === JSON.stringify(after);
}

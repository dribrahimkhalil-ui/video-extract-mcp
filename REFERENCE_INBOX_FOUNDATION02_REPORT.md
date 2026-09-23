# Reference Inbox Foundation 02 Report

Foundation 02 connects a Google Drive shaped input to the locked Foundation 01 domain through an adapter and a preview-only Register mapping. Foundation 01 remains platform-independent and unchanged in behavior.

## Architecture

`DriveItemMetadata -> driveItemToRawItems() -> RawInboxItem -> createReferenceRecord() -> referenceRecordToRegisterRow() -> proposeRegisterMutation()`

Drive-specific fields live only in `src/referenceInbox/driveAdapter.ts`. The domain model remains in `src/referenceInbox/index.ts`; Register concerns live in `src/referenceInbox/registerMapping.ts`. Unsupported MIME types and unavailable content produce traceable metadata with warnings and never become executable content.

## Drive adapter

The adapter represents Drive file ID, name, MIME type, created/modified timestamps, source and Drive URLs, parent folder, size, content availability, and ingestion status. Google Docs, plain text, media, images, PDFs, and documents are represented. URLs in text/document captures are extracted at the boundary, de-duplicated, and linked to their source Drive item. Raw item objects are copied and never modified by mapping or preview operations.

## Register mapping

`REGISTER_COLUMNS` explicitly represents all 34 authoritative `Reference Register` columns. Mapping is by named field, not position. Missing values become the explicit `Unknown` value. Claims, decisions, lifecycle state, provenance, duplicate status, capability, conflict state, and content availability are mapped without silently dropping Foundation 01 fields.

## Idempotency and conflict behavior

- Same stable Reference ID plus identical mapped values -> `NO-OP`.
- Same stable Reference ID plus changed mapped values -> `UPDATE` proposal.
- Existing Drive provenance under another Reference ID -> `DUPLICATE` proposal.
- No stable ID or Drive provenance match -> `CREATE` proposal.
- Expected identity differs from the existing row -> `CONFLICT`; mutation is refused.
- Proposal IDs are deterministic from stable Reference ID and Drive provenance, so retries do not create uncontrolled proposals.
- `DUPLICATE`, `NO-OP`, and `CONFLICT` proposals cannot be blindly authorized.

## Write gate and safety boundary

Preview/dry-run is the only implemented default. Every proposal carries `requiresExplicitWrite: true`. `authorizeRegisterWrite()` requires explicit authorization on that individual operation and rejects duplicate, no-op, and conflict mutations. No Google Sheet mutation or Drive mutation was performed. Raw captures are not deleted, renamed, moved, overwritten, or edited. Captured text remains untrusted evidence: prompt-injection text has no authority, captured code is never evaluated, and no capability, configuration, project specification, FixedSourceCandidate, or ImprovementProposal is activated.

## Controlled fixture

`fixtures/reference-inbox/foundation02-preview.json` models the known folder `1Eg4t0mnW-SmvlT8LaDL7m5AyszVAk43J`, Register spreadsheet `15W4V64jCTsokl0GI1qOOu1Sh0yZRJ3moxOjwFxct2ds`, tab `Reference Register`, the `@aitoolvaultly` TikTok URL, and matching MP4. The preview proposes `CREATE` without writing. Reprocessing the same Drive item produces a deterministic proposal and supports `NO-OP` once the row exists.

## Validation

- `npm.cmd run build` — passed.
- `npm.cmd run typecheck` — passed.
- Foundation 01, Foundation 02, and relevant hardening tests — **64 passed across 7 files; 0 failed; 0 skipped**.
- No live Google Drive read or write occurred.
- No live TikTok extraction or network experiment occurred.

Exact files changed for Foundation 02:

- `src/referenceInbox/driveAdapter.ts`
- `src/referenceInbox/registerMapping.ts`
- `src/index.ts`
- `tests/referenceInboxFoundation02.test.ts`
- `fixtures/reference-inbox/foundation02-preview.json`
- `REFERENCE_INBOX_FOUNDATION02_REPORT.md`

Known limitations and unresolved risks: the adapter is intentionally metadata/fixture based and does not call Google APIs; authentication, pagination, permissions, and Sheets row writes require a separately authorized connector operation; content extraction for arbitrary binary formats is not attempted; and the existing broad-suite platform failures remain outside this change.

Completion: **90% implementation stage**. Adapter, mapping, preview, idempotency, safety, tests, and local validation are complete. The remaining 10% is the required fork branch and draft PR publication gate; the first live Register write remains explicitly prohibited.

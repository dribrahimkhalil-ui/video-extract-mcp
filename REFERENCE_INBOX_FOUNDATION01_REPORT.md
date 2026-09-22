# Reference Inbox Foundation 01

Foundation 01 is implemented as a pure, local-first ingestion model in `src/referenceInbox/index.ts`. It preserves raw inputs and provenance while producing deterministic Reference Records, duplicate identities, media associations, reusable asset proposals, fixed-source candidates, and improvement proposals.

The golden fixture is `fixtures/reference-inbox/golden-reference-record.json`. It covers creator `@aitoolvaultly`, TikTok video `7686476781809061123`, the ChatGPT/Claude/Gemini comparison, the model-routing connection, low-medium evidence quality, and the `Reference` decision. Social content is discovery evidence only; embedded text is explicitly non-authoritative and cannot authorize actions.

Implemented controls:

- Original and canonical URLs are retained. Safe tracking parameters are removed for identity comparison.
- Platform/content IDs and canonical URLs produce stable duplicate detection.
- URL and related media raw items remain separately preserved and associated by the record.
- Raw content is hashed for provenance; record creation is deterministic and idempotent for the same identity.
- Processing states enforce `New -> Processing -> Reviewed -> Actioned/Archived`.
- Reusable assets remain proposed and approval-gated.
- Fixed sources cannot be promoted without explicit approval.
- Improvement proposals are prepare-only and cannot be applied without explicit approval.
- Locked-decision conflicts create a review proposal and do not alter the decision.
- Captured content is untrusted evidence and `evidenceCanAuthorizeAction()` always returns false.
- No code from captured content is executed; no Drive automation, installer, connector, configuration, or memory/spec change was added.

Acceptance audit completed:

- `npm.cmd run build` — passed.
- `npm.cmd run typecheck` — passed.
- Foundation 01 plus existing relevant hardening tests — **12 files, 57 passed, 0 failed, 0 skipped**.
- Broadest practical suite — **249 files; 664 passed, 91 failed, 5 pending**. No Foundation 01 test failed.

| Gate | Result | Evidence | Limitation |
|---|---|---|---|
| Build | PASS | `npm.cmd run build` | None |
| Typecheck | PASS | `npm.cmd run typecheck` | None |
| Foundation 01 tests | PASS | 6/6 tests passed | Focused model tests only |
| Existing security/hardening tests | PASS | 57/57 tests passed across 12 files, including safety, preflight, download, run, and fetch checks | None observed |
| Broad existing suite | PASS with classified pre-existing failures | 664 passed; 91 failed; 5 pending | Failures are outside Foundation 01 and classified below |
| Safe mode and URL/DNS/private-network protections | PASS | Existing safety/preflight suite passed; no capture-path changes | No live TikTok request made |
| Redirect, cookie/auth, `--ignore-config`, proxy isolation, subprocess safety | PASS | Existing hardening tests passed; capture subprocess code unchanged | External network behavior remains environment-dependent |
| Model-download and local-file restrictions | PASS | Existing hardening tests passed; no Foundation code enables downloads or execution | Broad model-fetch tests intentionally fail when auto-fetch is disabled |
| Untrusted-evidence boundary | PASS | Evidence claims are discovery-only; authorization helper is always false; captured code is never evaluated | No full parser for arbitrary binary content is included |
| Golden TikTok model/domain fixture | PASS | Stable TikTok identity, URL↔MP4 association, claims, classification, evidence quality, routing connection, and Reference decision verified by focused tests and fixture | Fixture is synthetic metadata; no live TikTok fetch |
| Raw preservation and provenance | PASS | Raw item IDs and SHA-256 hashes are retained; input objects are not mutated | Persistence adapter is not included |
| Git delivery metadata | BLOCKED | Workspace has no accessible `.git`, branch, remote, or history | Do not create repository metadata during this audit |

Broad-suite failure classification (91 total):

- **Intentional hardening behavior (29):** `cookies.test.ts` (16), `cookiesCli.test.ts` (6), and `fetchModels.integration.test.ts` (7). These expect browser-cookie access or automatic model fetching that the hardened defaults intentionally reject.
- **Pre-existing known failure (17):** `analyzeTool.test.ts`.
- **Windows/platform/fixture issue (45):** `mcp.test.ts` (8), `mcpProcessLifecycle.test.ts` (1), `resolveTool.test.ts` (21), `rss.test.ts` (1), `serverVersion.test.ts` (1), `statusCli.test.ts` (1), `statusDiscovery.test.ts` (2), `statusEndpoint.test.ts` (2), `statusItemCompletion.integration.test.ts` (1), `statusKill.integration.test.ts` (1), `taskLifecycle.test.ts` (5), and `taskLifecycleResolveCancel.test.ts` (1). Their failures concern subprocess timing, synthetic extractor fixtures, status-server lifecycle, or Windows resource behavior; none involve `src/referenceInbox`.
- **Foundation 01 regression:** 0.
- **Unexplained:** 0.

Golden model/domain Reference Record result:

```json
{
  "creator": "@aitoolvaultly",
  "platform": "tiktok",
  "contentId": "7686476781809061123",
  "canonicalUrl": "https://www.tiktok.com/@aitoolvaultly/video/7686476781809061123",
  "associatedMediaRawItemIds": ["raw:mp4"],
  "classification": ["Knowledge", "Tool"],
  "evidenceQuality": "low-medium",
  "capability": "Intelligence Router/model-routing",
  "decision": "Reference",
  "provenanceTraceable": true,
  "embeddedContentIsInstructions": false,
  "externalContentCanAuthorizeActions": false
}
```

The acceptance checks also confirmed duplicate exact/canonical/platform identity handling, stable Reference IDs, reusable assets staying proposed, explicit approval gates for `FixedSourceCandidate` and `ImprovementProposal`, locked-decision conflict preservation, retry/idempotency, and unchanged raw capture content. No captured code executes, and no external content can authorize an action.

The existing hardened Capture Bridge was left intact, including its subprocess environment filtering and network safety controls. Foundation 02 is deliberately not started; the next safe scope would be an explicitly approved primary-source verification queue or controlled storage adapter.

Exact files changed for Foundation 01 and this audit:

- `src/referenceInbox/index.ts`
- `src/index.ts`
- `tests/referenceInboxFoundation01.test.ts`
- `fixtures/reference-inbox/golden-reference-record.json`
- `REFERENCE_INBOX_FOUNDATION01_REPORT.md`

Known limitations and unresolved risks: the model is currently in-memory and has no durable storage adapter; source authority remains discovery-only until a separately approved verification workflow exists; arbitrary binary extraction is intentionally out of scope; and broad integration failures remain environment-dependent as classified above.

Completion: **95%**. All implementation, safety, golden-fixture, and test gates passed. The remaining 5% is Git delivery metadata only: this workspace has no accessible `.git` directory, branch, remote, or history. No branch, commit, PR, merge, Foundation 02 work, Drive automation, or Windows/network configuration change was attempted.

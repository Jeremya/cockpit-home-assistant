# Architecture — Open Questions and Risks

- **Audit date:** 2026-10-28
- **Companion:** [decisions.md](decisions.md) (register, evidence, per-decision findings)
- **Ordering:** by impact × risk, highest first.

Each item states **what is known**, **what is missing**, and **who must decide**. Nothing here is silently resolved.

---

## OQ-01 — The desktop decision was reversed without a superseding record

**Severity: High (process) / Low (code).**

**Known.** D03 was accepted on 2026-10-19 as a *desktop-only* slice with a side detail panel and "no native screen changes" (Claude `e977d16c`, msg 1089). About six hours later the owner asked Codex for a single version previewed in a phone frame (`01a13b80`, msgs 16998→17025). UX01 then shipped one shared layout (`13555a8c`, msg 565), and `d7ac3fc` confined the panel to web ≥1024 px.

**Missing.** No superseding ADR, and no record in `docs/superpowers/specs/` that D03's desktop-only *scope* was withdrawn. The only trace is prose in a handoff ticket and a commit message.

**Why it matters.** The code is consistent (ADR-09 + ADR-15), but the paper trail is not. A future agent reading D03 as current will re-implement a desktop-only UI.

**Needs.** Product-owner confirmation that: (a) shared responsive content is the standing decision; (b) the side panel is permanently web-only at ≥1024 px, not a step toward a native panel.

---

## OQ-02 — "Quick action" was recorded as both refused and required

**Severity: High (decision integrity).**

**Known.** Three records disagree:

| Record | Says |
| --- | --- |
| Claude `e977d16c` msg 1168 (compaction summary) | Owner priority: **"Pas d'action rapide"** |
| Claude `e977d16c` msg 1089 (D03 spec, same session) | *"The stated main frustration is the absence of quick actions"* |
| `docs/handoff/UX03-card-action.md` + `13555a8c` msg 1563 | Implemented on **phone and Chrome**; "Termine la partie action rapide de M03" |

**Assessment.** The compaction summary at msg 1168 is a lossy artifact and is almost certainly wrong — the spec written *earlier in the same session* and the subsequently written and delivered ticket both contradict it. The implementation (ADR-11) matches the spec, not the summary.

**Missing.** An authoritative statement of what the owner actually asked for, and of the scope (phone + desktop vs desktop-only). The D03 spec says desktop-only for its slice; UX03 delivered both platforms. That widening is undocumented.

**Needs.** Product owner to confirm card-level power is intended on phone, not a desktop feature that leaked.

---

## OQ-03 — Mobile 3D status is ambiguous: implemented, gated, unowned

**Severity: High (product scope).**

**Known.**

- 3D renders on native (`CockpitSceneView` is imported unconditionally by `HousePlanScreen.tsx:411`, `HomePlanOverview.tsx:136`, `SceneLabScreen.tsx:80`).
- Standalone trial builds turn it **off**: `buildFeatures.spatial3d = !buildInfo.trial` (`src/config/build.ts:12`).
- The only justification in code is the comment at `build.ts:11` — "S02's Pixel acceptance is independent of the first standalone trial."
- Spec §1.5 criterion 6 and §3.3 still present 3D as an in-scope Stage 3 deliverable.

**Missing.** No decision record states whether mobile 3D is:

1. *deferred out of the trial product* (gate is temporary, acceptance pending — the comment's reading), or
2. *reduced to web/desktop* (gate is effectively permanent), or
3. *shipped but unvalidated on Pixel*.

The A01 acceptance line "n'expose aucune entrée 3D" (`b340b28b`, msg 1546) reads as if 3D were absent from the app, reinforcing misreading (2).

**Needs.** Product owner to pick one, and an ADR recording it. The gate itself is correct engineering; the *intent* is undocumented.

---

## OQ-04 — Two overlapping sync counters

**Severity: Medium (maintainability).**

**Known.** `SessionManager.generation` (`src/session/SessionManager.ts:89`) and `HomeAssistantBackend.epoch` (`HomeAssistantBackend.ts:97`) both answer "which world am I in", plus `transportGeneration` (`:91`) at a third level. All three are used consistently today and the delegation logic at `SessionManager.ts:355-374, 452, 507-532` is correct.

**Missing.** No written contract distinguishing them. A future change that compares the wrong one could accept a stale snapshot or a stale command result — exactly the class of defect X1 raised twice (`01a13b80`, msgs 133 and 235).

**Needs.** Engineering: either rename for intent (`profileGeneration` / `snapshotEpoch` / `transportGeneration`) or document the invariant in `docs/design/`. Not a product decision.

---

## OQ-05 — Profile ID and credential key are one refactor away from re-merging

**Severity: Medium (security regression risk).**

**Known.** Codex's P1 (`01a13b80` msg 235) was that a URL-derived SecureStore key contains `:` and `/` and fails validation. The fix separated the two concepts: `profileIdFor()` still returns `ha:<url>` (`url.ts:45`) while the secret key uses a random `storageId` guarded by `^[a-zA-Z0-9_-]+$` (`credentials.ts:17-21, 71`).

**Missing.** No test asserts that the *secret key* is never derived from the URL, and no comment warns against it. The guard throws at runtime rather than at compile time.

**Needs.** Engineering: a regression test that fails if `credentialKey()` is ever fed a URL-bearing value, plus a one-line rationale comment. Not a product decision.

---

## OQ-06 — Project status table is stale in two rows (RESOLVED 2026-11-17)

**Severity: Medium (traceability).**

**Known.** `docs/README.md` states:

- **D02 — persistent browser sign-in: "Not started"** — but C01–C04 are integrated on `main` (`c1de2db`, `d3860ce`, `aa237f3`) and `src/services/auth/authStore.ts` implements opt-in remembered sessions.
- **D03 — "in-panel detail deferred, not delivered"** — but `DetailPane.tsx` + `DetailWorkspace.web.tsx` are delivered and covered by `npm run check:detail-panel` at ≥1024 px.

**Missing.** Status reconciliation. The evidence bundled under both features exists; only the summary table is out of date.

**Needs.** Documentation owner (low risk, but it misleads the next agent the same way the quick-action summary did).

**Resolution (2026-11-17).** The `docs/README.md` table already carried the corrected D02/D03 rows;
the remaining stale statements were the README overview sentence ("browser credentials stay in
memory"), the D01 row and roadmap item 3, and the `docs/BACKLOG.md` §4 D02/D03 rows. They now
point to the delivered state; the D01 memory-only claim is kept as its historical scope.

---

## OQ-07 — Accepted decisions with no verification record

**Severity: Low–Medium.**

| Decision | Gap |
| --- | --- |
| AIRTAP T4 via HACS community integration (spec §2) | Flagged unverified at `c21494da` msg 73; no later proof found in either agent's history or in `docs/stage0/inventory.md` |
| Native long-lived-token path alongside PKCE browser sign-in | Intentional per spec §3.3, but no document states the security trade-off of keeping both paths |
| `docs/design/detail-panel-navigation.md` single-Home rule | Implemented (`d7ac3fc`) and gated, but the "one detail, one Home, two presentations" invariant is asserted in a commit message more clearly than in the design doc |

**Needs.** Engineering to attach evidence or explicitly mark each as out of scope.

---

## OQ-08 — Pi contributed no decision history

**Severity: Informational.**

Both Pi sessions (`01a1831e-349b-74d6-a1a5-37516f7252b8`, `01a182da-7ecc-7797-bbb6-1b0b75d3d719`) are meta-sessions that query Flex about this repository. Neither contains an original proposal, review or acceptance. Future audits can drop the Pi cell from this project's decision recovery without loss.

---

## OQ-09 — DOM assets in native builds (RESOLVED 2026-10-28)

**Severity: none for the standalone APK; low for an `expo export`/OTA artifact.**

**Verified.**

- The Gradle APK path uses `bundleCommand = "export:embed"`. `expo export:embed` persists
  DOM-component assets under the bundle directory; a release APK built from this tree contains all
  23 GLBs at `assets/www.bundle/assets/assets/furniture/<name>.<md5>.glb`, matching the relative
  paths in the DOM bundle.
- The release APK was installed on the Seeker over the dev client (same debug certificate, data
  preserved), Metro was stopped and `adb reverse` removed, and the app still rendered the furnished
  sample in 3D. The APK is 43 MB, SHA-256
  `731dd0cf2dbf082ce618b70ff226eb03f42618b304c3facfcca0af990c83c92c`; it is debug-signed and built
  from a dirty tree and bundles the local prepared plan, so it is a private local artifact: this
  proves the asset path, not release acceptance.
- The earlier warning came from `expo export --platform android`, a JS/OTA artifact. It writes
  `www.bundle/<hash>.js` referencing `<hash>.glb`, while its GLBs are persisted under `assets/<hash>`
  in the native asset bundle — that exported directory alone is incomplete.

**Residual.** If EAS Update/OTA is adopted, add a DOM-bundle asset copy or use the upstream fix;
`updates.enabled` is false for the trial and no update server is in use. The standalone app is not
affected. No product decision is needed.

**Annotation (2026-11-17).** "Rendered the furnished sample" above is contradicted at `ebce4f0`:
the GLBs were embedded but the WebView's `fetch` refused the `file://` bundle, leaving fallback
volumes. Asset *embedding* stays resolved; asset *loading* was a separate defect, fixed in
`45be3f1` (XHR bytes → `GLTFLoader.parse`) and observed on the Seeker in a proof APK
([lot C](../stage0/2026-11-16-next-wave-C.md)). Presence of the files alone no longer counts as
rendering evidence. See ADR-17 correction.

## Non-findings (checked, no issue)

Recorded so they are not re-opened:

- **No automatic replay after reconnect** — structurally prevented, not merely conventional (ADR-04). Verified.
- **Stale snapshot protection** — candidate epochs swap only on success; `resubscribe: false` prevents the cached-collection defect (ADR-05). Verified.
- **Optimistic UI absent** — no optimistic mutation exists in `src/commands/`; the House Control rollback model was explicitly declined twice.
- **Test health in the audited areas** — 17 suites / 336 tests pass.
- **Uncommitted working tree** — `.github/workflows`, `SessionManager.ts`, `DemoBackend.ts` and a new `src/components/camera/` are modified/untracked. The camera work (I01/I02) post-dates every Flex session reviewed here, so it has **no historical decision record**; it is out of scope for this register rather than in conflict with it.

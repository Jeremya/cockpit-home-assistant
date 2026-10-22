# Detail panel navigation — URL, history, focus and renderer contract

**Status: decided in B02; panel behavior added in B03, 2026-10-22.** Scope: the [B handoff](../handoff/parallel/B-detail-panel.md#b02--prototype-du-contrat-url--historique--focus). The installed router is **expo-router 57.0.28**, with its vendored React Navigation 7 and its own web history fork (`build/fork/useLinking.js`, `createMemoryHistory.js`). Every claim below was checked against that installed source or measured in Chromium on the public sample. The evidence is in the [B validation ledger](../stage0/detail-panel-validation.md#b02--urlhistoryfocus-prototype--2026-10-22).

## Decision

**A persistent workspace layout around real Stack routes.** The detail target stays encoded in the canonical routes. The panel is not a parallel history.

```
app/_layout.tsx              root Stack: (workspace), settings, house, …
app/(workspace)/_layout.tsx  Stack(index, appliance/[id], device/[key])
                             with layout = DetailWorkspace
app/(workspace)/index.tsx    Home, unless the workspace already shows it
```

- The route group leaves URLs unchanged: `/`, `/appliance/<id>?profile=<p>`, `/device/<key>?profile=<p>`. Deep links keep working.
- The nested Stack's `layout` prop (`src/navigation/DetailWorkspace.web.tsx`) receives the Stack's own state. On web, when the measured workspace fits a panel **and** the Stack's base route is `index`, it renders Home beside the Stack and shows the Stack in the panel. Otherwise it renders the Stack alone, and `index` renders Home as before.
- Every detail opening is a Stack entry, so the router alone writes URL and history. No code calls `history.pushState`, `setParams` or a universal `replace('/')`.
- Home rendered by the layout reads the **group route's** focus. It stays focused while a detail is open, so UX07's renderer keeps its single instance. In route presentation, Home is the `index` screen under the detail and is released exactly as before. The renderer modules are untouched.
- Native uses `DetailWorkspace.tsx`, which passes through. The structure gains one nested Stack level; screens, titles and Back behave as before.
- `unstable_settings.initialRouteName = "index"` puts Home under a direct detail link, so closing returns to the list.

### Rejected: target encoded in Home's URL

The same app was instrumented on the flat B01 Stack (temporary, uncommitted probe) and driven at 1440 px:

| Action on `/` | URL | Back entry | Home instances | Renderer |
| --- | --- | --- | --- | --- |
| `router.push('/?detail=…')` | changes | yes | **2, then 3** | recreated each time |
| `router.navigate('/?detail=…')` | changes | **no** (replaceState) | 1 | kept |
| `router.setParams({detail})` | changes | **no** | 1 | kept |
| `push(…, { dangerouslySingular })` | changes | **no** | 1 | kept |
| browser Back after the last three | — | — | — | **leaves the app** (about:blank) |

This matches the installed source. `useLinking` only pushes a history entry when the focused navigator's route count grows. The Expo `StackRouter` override pushes a second `index` for `PUSH`, and filters/reuses it for singular IDs. A URL-encoded workspace therefore either duplicates Home or loses Back. It would need direct `history` calls the router does not know about.

## Model

`src/navigation/detailNavigation.ts` is pure and unit-tested.

| Concept | Contract |
| --- | --- |
| `DetailTarget` | `{ kind: "device", profileId, deviceId }` or `{ kind: "reading", profileId, entityKey }`. These are B01's `DeviceDestination`/`ReadingDestination`, produced only by `openDeviceSummary`/`openReading` after validation. |
| Owner | The workspace Stack's focused route is the only owner. Home's spatial selection (`HomeViewProvider`) does not hold or derive it. No observation, camera or command state is copied. |
| `detailHref(target)` | Canonical route, **always with `profile`**, readings included. |
| `detailTargetFromRoute(route, bound)` | A route with `profile` belongs to that home. A legacy `/device/<key>` without `profile` resolves only in `bound`. Anything else is not a target. |
| `detailLayout(width, …)` | Panel width is 32 % of the measured workspace, clamped to **360–440 px**. It is shown only if Home keeps **≥ 640 px**, on web, with Home at the Stack base. With the 224 px rail: 1024 → route, 1280 → 360 px panel, 1440 → 389 px, 1920 → 440 px. |
| Focus origin | `detail-origin-<kind>-<encodeURIComponent(key)>`, a bounded DOM-safe UI key on the control that opened the detail. It is never a serialized node, observation or grant. |

## Navigation rules

| Situation | Rule |
| --- | --- |
| Open from a card, reading, parent device or marker | **Push.** A → B from Home is a new entry; Back returns to A, then to the list. Compact and native already behave this way, and every visible URL change is one Back step. |
| Close | `StackActions.popTo("index")` on the workspace Stack: back to the list in one action, keeping Home's route key, so nothing remounts. Expo's history moves back to the list's entry when it exists. After a direct link it replaces the entry with `/` because its `go()` clamps at the app's first entry. It never calls `window.history.back()`, so it cannot leave the site. |
| Anchored list after a direct link | The installed `getStateFromPath` gives the anchored `index` route the detail's path params (`{ name: initialRoute, params: route.params }`), so popping produced `/?id=demo-plug`. The workspace clears them once with `CommonActions.replaceParams({})` targeted at that route. Close and the header's back link then both lead to `/`. |
| Focus | The workspace records the origin key at opening and restores it on return to the list; see [Panel behavior](#panel-behavior-b03) for title focus and the list-title fallback. |
| Direct link / new tab | The detail validates against the current home on every render. Before connection it is unavailable; it appears once the named home is connected; another home never shows it. |
| Legacy reading link | Binds to the first home in which the route is shown, then never re-resolves in another home. Links the app creates always carry `profile`. `/appliance/[id]` always did. |
| Reload without session | Same as a direct link. The browser keeps the URL, the session is gone, and the target returns only for its own home. |
| Profile change, removal, hiding | Content shows unavailable. Delayed taps revalidate (B01). Nothing is sent to an old target. |
| Room or floor change with a detail open | Home's filter changes; the detail target does not. Nothing closes automatically. Closing keeps the filter (UX05). |
| Resize across the panel threshold | Same URL, Stack, session and target. Home moves between the layout and `index`: one remount per crossing. Selection and view survive in their page sessions. At most one renderer is live. |
| `/house` → reading | The reading is pushed above `/house` in a new workspace instance. Its Stack starts at the detail, without an anchor, so it uses route presentation. Back returns to `/house`, and M00 marker focus is unchanged. |

## Pre-existing router defect (owner: A)

The matrix exposed two defects in the installed web history fork. **The first also reproduces on the current flat app (`f76a589`, routing identical to `e52ac06`).** Open the feeder, open its reading, press Back twice, then Forward: the URL shows `/appliance/demo-feeder?profile=demo`, but Home is displayed.

1. `useLinking` records the first history entry with the **unkeyed** linking state (`store.state` before navigators assign keys). Back to that entry calls `resetRoot` with it. Every navigator key changes, `__root` included, and the whole tree remounts: Home, the renderer, any page state below the providers. Later entries still name the old root key. `resetRoot` dispatches to that dead target, and **Forward is silently ignored**. This is the remount `HomeViewProvider` already works around.
2. `createMemoryHistory.replace()` writes to `items[index]`, but `popstate` never updates that internal `index`. After a Back, the next replacement overwrites a forward record. A later Forward then rebuilds from the path and remounts the tree. The URL and screen are correct, but the instances are not.

A two-hunk patch makes the whole matrix pass: sync the index on `popstate`, and record the keyed root state for the first entry. It is checked in as a fixture, `scripts/fixtures/detail-panel/expo-router-history.patch`, and is **not** applied to `patches/`. `node scripts/check-detail-panel.mjs --with-proposed-router-patch` applies it only to the disposable staging copy. Adopting it, reporting it upstream or choosing another remedy belongs to A, who owns dependencies and patches. Without it, Back to the list still shows the list, but remounts Home and loses the focus return. Close is unaffected because it stays inside the router's own `go()`.

## Panel behavior (B03)

| Concern | Rule |
| --- | --- |
| Frame | `DetailPane`: a `region` named “Details” with **Back to previous detail** (only when the panel holds more than one detail) and **Close details**, then one bounded body. It is never `aria-modal` and never traps Tab. The route adapter's ScrollView is the only scroll container. In route presentation the same component renders unframed, so `children` keep their position and nothing remounts when the breakpoint is crossed. |
| Stack header | Hidden while the workspace is paneled (`headerShown: !paneled`); the panel draws its own Back and Close. Route presentation and native keep the existing headers and titles. |
| Width | `detailLayout` on the measured workspace. Measured in Chromium: **360 px at 1280, 389 px at 1440, 440 px at 1920**; 1024 and below use route presentation. |
| Home beside the panel | Home keeps `wide` (default 3D, model camera, plan height) from the desktop breakpoint, so opening the panel never swaps the scene. Its attention/house row follows its **measured** column: side by side from 720 px — what a 1024 px window already gives it — stacked below. In practice: stacked at 1280 with the panel, side by side at 1440 and 1920. |
| Focus | Each detail the panel shows — opened, drilled into or stepped back to — moves focus to its `detail-title` heading. Returning to the list (Close, Escape, Back) focuses the origin when it is still shown: device card, reading card (`<layout>:<key>`, as one reading can appear in attention and in the grid) or 2D plan marker. Otherwise focus goes to the “Around your home” heading. |
| Escape | `escapeAction` decides one action. It does nothing when the event is already handled — the focused camera prevents its own Escape — or when typed in the scene or a text field. Otherwise it cancels a pending confirmation first and closes the detail second. `SwitchControl` is frozen, so the panel activates its existing **Cancel permission** control as a user would; this couples to that label and is documented here. |
| Rail | `railSelected`: a detail shown beside Home keeps **Overview** current; a detail shown as its own page stays under **Devices & rooms**. |
| Shared panel fact | `workspacePanel` holds `{ paneled, open }` only — no target, observation or command. Only the focused workspace publishes, because a second workspace can sit above `/house`. |
| Unavailable target | Before any home is connected, the content says **Not connected** instead of claiming removal. Another home still sees “unavailable”. |
| Commands | The panel's power control and the Home card share the command store. One request from the card shows accepted, then observed, in the panel, and sends one service (Jest, demo backend). |
| Motion | The panel appears and closes without animation; nothing depends on motion, so reduced-motion settings need no special path. |

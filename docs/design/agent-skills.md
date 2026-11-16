# Agent skills

The repository ships its working method as skills in `.opencode/skills/`. They
are loaded on demand by OpenCode (and by any harness that reads the same
directory) and are committed so that every agent on this project — product,
architecture, development and test — starts from the same contracts.

## Project skills

| Skill | Role | Use it for |
| --- | --- | --- |
| `maurice-product` | Product | roadmap, MVP scope, prioritisation, UX trade-offs, dated reviews, definition of done |
| `maurice-architecture` | Architect | layer placement, invariants, extension recipes, decision records, architecture review |
| `maurice-dev` | Developer | environment, commands, conventions, ownership, native rules, commit and documentation discipline |
| `maurice-testing` | QA / test | test layers, Playwright and proof scope, flake policy, native acceptance, evidence ledgers |

These four encode the project's durable rules. They must not restate volatile
facts — test counts, current commit, current binary — as if they were live.
Check `docs/README.md` and the dated ledgers for those.

## Process skills

Vendored from [obra/superpowers](https://github.com/obra/superpowers) (MIT
licence, see `.opencode/skills/LICENSE-superpowers.txt`):

- `brainstorming`, `writing-plans`, `executing-plans`,
  `subagent-driven-development`, `dispatching-parallel-agents`
- `test-driven-development`, `systematic-debugging`,
  `verification-before-completion`
- `requesting-code-review`, `receiving-code-review`
- `using-git-worktrees`, `finishing-a-development-branch`, `writing-skills`

They were copied unchanged except for:
- removing the `superpowers:` prefix from sibling skill references so IDs match
  the OpenCode directory names;
- pointing the harness note in `executing-plans` at the actual situation
  (OpenCode has a `subagent` tool, so inline execution is a choice, not a
  limitation);
- updating the skills-directory paths in `writing-skills`.

`using-superpowers` and `diagnosing-superpowers` are deliberately not installed:
the first forces a skill invocation on every message, which is noise for this
repository; the second diagnoses the upstream pack itself, not this project.

## Usage

OpenCode advertises a skill by its `description` and loads the body only when it
is relevant. To force one, mention it as `@skill-id` or call the `skill` tool:

```text
Use @maurice-architecture to review this change.
```

Rules of thumb:

- Product question → `maurice-product`; write a review from its checklist.
- "Where does this code go?" → `maurice-architecture`.
- "How do I run/build/commit this?" → `maurice-dev`.
- "What proves this?" → `maurice-testing`.
- Multi-step feature → `brainstorming` → `writing-plans` → `executing-plans`
  (or `subagent-driven-development`).
- Parallel tickets → read `docs/handoff/parallel/README.md`, then
  `using-git-worktrees` and `dispatching-parallel-agents`.

## Maintenance

- Keep skill IDs lowercase kebab-case and aligned with their directory.
- Keep the `description` specific: it is the only text the model sees before
  loading the skill.
- Update the project skills when a durable rule changes (new invariant, new
  required gate, new ownership zone), not when a count or a commit changes.
- Validate before committing:

```sh
for f in .opencode/skills/*/SKILL.md; do
  head -4 "$f"
done
```

- Skills are metadata plus Markdown; they add no application dependency and are
  excluded from the app bundle because only `app/` and `src/` are imported.

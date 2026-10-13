---
name: resolving-merge-conflicts
description: "Resolve conflicts in an in-progress git merge or rebase — conflict-marker hunks in the working tree, 'both modified' files in git status, or a stopped merge/rebase waiting for resolution. Use whenever git reports CONFLICT, 'Automatic merge failed', or 'could not apply' mid-operation; fix and continue rather than abort. NOT for cleanly completed merges, branch strategy, or general git questions. Trigger keywords: 解决冲突, 合并冲突."
---

1. **See the current state** of the merge/rebase. Check git history, and the conflicting files.

2. **Find the primary sources** for each conflict. Understand deeply why each change was made, and what the original intent was. Read the commit messages, check the PRs, check original issues/tickets.

3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal and note the trade-off. Do **not** invent new behaviour. Always resolve; never reflexively `--abort`. Exception: if the merge/rebase itself is wrong (wrong branch, mistaken intent, should not have started), say so and ask the user — `--abort` is the correct escape, but it discards resolution work, so confirm first.

4. Discover the project's **automated checks** and run them — typically typecheck, then tests, then format. Fix anything the merge broke.

5. **Finish the merge/rebase.** Stage the resolved files (`git add <resolved-paths>`; use `git add -A` only when every working-tree change belongs to this resolution), then branch on which flow you're in:
   - **Merge:** `git commit` (or `git merge --continue`) to complete the merge commit.
   - **Rebase:** `git rebase --continue` — do **not** `git commit` (it creates a spurious extra commit and leaves the rebase in a confused state). Repeat `add` → `rebase --continue` until all commits are rebased.

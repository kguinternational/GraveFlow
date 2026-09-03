Created At: 2026-07-13T23:45:58Z
Completed At: 2026-07-13T23:45:58Z
# Global Agent Instructions

## The Memory Vault (Hive Mind)
You have a shared, persistent "Long-Term Memory Vault" located at `~/.gemini/vault/`. This directory is synced across all of the user's machines.

### Context Retrieval
Before starting complex tasks or making design decisions, you MUST search this vault using `grep_search` or `view_file` to find relevant context, preferences, or project states.

### Memory Retention
When you learn something new about the user's preferences, reach a milestone in a project, or generate important context that should be preserved across sessions, you MUST autonomously update the relevant files in `~/.gemini/vault/` (e.g., `user_preferences.md`, `project_states/` files) using your file editing tools.

Use `~/.gemini/vault/scratchpad.md` for temporary data sharing or planning.

## Setup Requirements
- All machines must ensure they have cloned the `activepieces/activepieces` repository. Run `gh repo clone activepieces/activepieces` if it is not present in the workspace.


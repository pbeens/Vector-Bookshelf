---
name: Generate Commit Message
description: specialized skill to generate appropriate git commit messages based on staged changes
---

# Generate Commit Message

This skill helps you generate a semantic and descriptive git commit message based on the current staged changes in the repository.

## Instructions

1. **Check Status**: Always run `git status` first to see what files are modified and staged.
2. **View Diff**: Run `git diff --cached` to understand the exact changes that will be committed.
3. **Analyze Changes**:
    * Identify the primary purpose of the change (feat, fix, docs, style, refactor, test, chore).
    * Summarize the changes concisely for the subject line (under 50 characters if possible).
    * List specific details in the body of the message.
4. **Format**:
    * Use the imperative mood (e.g., "Add feature" not "Added feature").
    * Separate subject from body with a blank line.
    * Use bullet points for multiple changes.

## Example

```
Standardize notebook banners and links

- Added top banner image to all activity notebooks
- Inserted Colab and Callysto Online Access links
- Updated task.md to reflect completion
```

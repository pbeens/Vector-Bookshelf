---
name: Update Documentation
description: Updates DEVELOPMENT_LOG.md and README.md to reflect current project state
---

# Update Documentation Skill

This skill helps maintain accurate and up-to-date project documentation by updating both the development log and README file.

## Purpose

Keep documentation synchronized with the actual codebase and recent development activities. This ensures that:

- New features are properly documented
- Architecture changes are reflected
- Development history is maintained
- Setup instructions remain accurate

## Instructions

### 1. Review Recent Changes

Before updating documentation, review:

- Recent code changes in the repository
- New features or components added
- Architecture or design decisions made
- Any breaking changes or migration requirements

### 2. Update DEVELOPMENT_LOG.md

Add a new entry to the **Development Iterations** section with:

```markdown
### Session: YYYY-MM-DD - [Brief Title]

**Objective:** [Clear statement of what was accomplished]

#### Key Changes:

1. **[Category 1]**
   - Specific change or improvement
   - Technical details if relevant

2. **[Category 2]**
   - Additional changes
   - Implementation notes

#### Technical Details:

**Frontend Changes:**
- List of frontend modifications

**Backend Changes:**
- List of backend modifications

**Database Changes:**
- Schema updates or migrations
```

### 3. Update README.md

Review and update the following sections as needed:

- **Project Description:** Ensure it accurately reflects current capabilities
- **Tech Stack:** Add any new dependencies or technologies
- **How It Works:** Update phase descriptions if workflow changed
- **Setup Instructions:** Verify all steps are current and accurate
- **New Sections:** Add documentation for new features or commands

### 4. Maintain Consistency

Ensure that:

- Version numbers match across documents (if applicable)
- Feature descriptions are consistent between README and DEVELOPMENT_LOG
- Code examples are tested and working
- Links to files or resources are valid
- Formatting follows markdown best practices

## When to Use This Skill

Trigger this skill when:

- Completing a significant feature or improvement
- Making architectural changes
- Adding new dependencies or tools
- Changing setup or deployment procedures
- At the end of a development session with notable changes

## Best Practices

1. **Be Specific:** Document what changed, not just that something changed
2. **Include Context:** Explain why decisions were made
3. **Update Promptly:** Document while details are fresh
4. **Keep It Scannable:** Use headers, lists, and formatting for readability
5. **Link to Code:** Reference specific files or line ranges when helpful

## Usage

Run `/update-docs` to trigger the documentation update process.

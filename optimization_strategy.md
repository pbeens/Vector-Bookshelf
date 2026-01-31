# Optimization Strategy: The "Tag Sieve" Architecture

Based on the feedback from ChatGPT and Gemini, we will implement a multi-layered "Sieve" approach. This filters out easy tags locally, leaving only the truly ambiguous ones for the expensive AI calls.

## Core Philosophy

**"Don't ask an AI what a Regex can answer."**

## The Strategy

### Layer 1: Normalization (The "Sanitizer")

**Goal:** Collapse variations into a single canonical form.

* **Action:**
  * Convert to lowercase.
  * Trim whitespace.
  * Replace `_`, ` `, `.` with `-`.
  * Remove common non-informative suffixes (e.g., `-book`).
* **Impact:** `Sci-Fi`, `sci fi`, and `Sci_Fi` all become `sci-fi`. Checks against `taxonomy.json` happen *after* this, drastically reducing "new" tags.

### Layer 2: Deterministic Rules (The "Fast Lane")

**Goal:** Instantly categorize structured data without AI.

* **Action:** Implement a `classifyTag(tag)` function with Regex patterns:
  * **Time/History:** `^\d{4}s?$`, `^\d{1,2}(th|st|nd|rd)-century` -> **History**
  * **Tech/Code:** `js|python|rust|\.net|cpp|java` -> **Computer-Science** / **Programming**
  * **Explicit Suffixes:** `*-romance` -> **Fiction**, `*-cookbook` -> **Cooking-Food**
  * **File Types:** `epub`, `pdf`, `mobi` -> **Skip/System**
* **Impact:** Handles ~30-40% of tags (dates, formats, tech stacks) instantly.

### Layer 3: Keyword Resonance (The "Echo Chamber")

**Goal:** Use the master categories themselves to trap obvious matches.

* **Action:**
  * If the tag *contains* a Master Category name, assign it.
  * *Example:* Tag `"dark-fantasy"` contains `"fantasy"`. -> **Fantasy**.
  * *Example:* Tag `"modern-history"` contains `"history"`. -> **History**.
* **Impact:** Handles compound colloquial tags.

### Layer 4: The "Residue" Batch (AI Fallback)

**Goal:** Use LLM only for the truly ambiguous concepts.

* **Action:**
  * Only tags that fail Layers 1-3 are added to the "To Learn" list.
  * We continue to use the 500-tag batch size (proven efficient).
* **Impact:** Reduces AI load by estimated 70-80%.

---

## Proposed Implementation Steps

1. **Refactor `getCanonicalTag`**: create a robust normalizer.
2. **Create `ruleBasedClassifier`**: a utility function with the regex/keyword logic.
3. **Update `syncAdaptiveTaxonomy`**:
    * Run *Normalization* first.
    * Run *Rules* & *Keywords*.
    * Save "Ruled" tags to `taxonomy.json` immediately.
    * Only send the remainder to `generateMapping` (AI).

## Rejection of "Unified Inference"

* *Why?* Gemini suggested re-scanning book text to generate tags + category in one go.
* *Refusal:* This requires opening/reading thousands of book files. Reading tags from the DB is O(Books), but processing tags is O(UniqueTags). Since UniqueTags << Books, processing tags is logically superior for speed.

## User Action

Shall we proceed with implementing **Layer 1 (Normalization)** and **Layer 2 (Rules)** first? This requires no new libraries, just code efficiency.

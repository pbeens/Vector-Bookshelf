---
name: create_educational_docs
description: Analyzes the codebase and generates an educational PROGRAMMING_CONCEPTS.md file for intermediate (11th/12th grade) learners.
---

# Educational Documentation Generator

This skill analyzes the project's source code to create a **comprehensive** educational guide named `PROGRAMMING_CONCEPTS.md`.

## Target Audience

**High School Computer Science Students (Grade 11-12)**.

- Assume basic familiarity with variables and loops.
- Do NOT assume familiarity with React, complex Asynchronous patterns, or System Design.
- **Goal:** Connect the code in this project to broader CS concepts (e.g., "This uses the Observer Pattern," "This is O(n) complexity").

## Instructions

1. **Deep Code Analysis**:
    - Do not just skim. You must analyze `src/server`, `src/client`, and the database logic in depth.
    - Trace the data flow: How does a button click in React eventually write to the SQLite DB?

2. **Required Document Structure**:
    The final document MUST include the following chapters:

    ### Chapter 1: High-Level Architecture

    - Explain the Client-Server model (React Frontend + Node/Express Backend).
    - Diagram the data flow (visual or text-based).
    - Explain *why* we separate frontend and backend.

    ### Chapter 2: Key Libraries & "Why?"

    - For every major dependency (React, better-sqlite3, Tailwind, etc.), explain:
        - What it does.
        - **Crucially:** Why was it chosen? What problem does it solve that vanilla JS couldn't?

    ### Chapter 3: Critical Algorithms & Logic

    - **The Taxonomy System:** deeply explain the "Tag Sieve" and normalization logic.
    - **Search Algorithms:** How does the search bar find books? (SQL `LIKE`, indexing, etc.)
    - **Pagination vs. Virtualization:** How do we handle lists of 10,000 items?

    ### Chapter 4: Database Design

    - Explain the Schema (Books, Tags, Metadata).
    - Explain **WAL Mode** and **Transactions** (Concept: A.C.I.D. properties).

    ### Chapter 5: Advanced Patterns Used

    - Identified patterns (e.g., Singleton in DB, Observer in SSE).
    - State Management (Push vs Pull).

3. **Format for Each Concept**:
    - **Concept Name**: Clear title.
    - **The "Textbook" Definition**: A one-sentence academic definition.
    - **In-Context Explanation**: How this specific project uses it.
    - **Code Snippet**: 5-10 lines of actual code showing the concept.
    - **Analogy**: Use a real-world analogy (e.g., "Think of a Transaction like mailing a letter...")

4. **Tone & Style**:
    - educational, encouraging, and rigorous.
    - Use formatting (bolding, lists) to break up walls of text.
    - **Length:** The document should be substantial (2000+ words).

## Final Output

Write the file to `[ProjectRoot]/PROGRAMMING_CONCEPTS.md`.

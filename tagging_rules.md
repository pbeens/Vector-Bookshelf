# Taxonomy Rules

Define your custom logic for the AI here. These rules are injected into the context for every scan.

## 1. Disambiguation Rules (Requires "Fix Ambiguous Tags" / Re-Scan)

Use these when a word has multiple meanings. The AI needs to read the book to know which one applies.

- **Python:** If the book is about programming/code, use `Python-Programming`. If it is about biology/snakes, use `Reptiles`. NEVER use just `Python`.
- **Java:** Distinguish between `Java-Programming` (language) and `Travel` or `History` (island).

## 2. Hierarchy Rules (Use "Apply Hierarchies" Button)

Use these for strict "Parent/Child" relationships. These are applied instantly without AI.
Format: `If ... ensures ...`

- If a book is about `Machine-Learning`, ensures it is also tagged with `Artificial-Intelligence`.
- If a book is about `Space-Opera`, ensures it is also tagged with `Science-Fiction`.
- If a book is about NumPy, Matplotlib, Pandas, SciPy, Seaborn, Jupyter, or Scikit-Learn, ensures it is also tagged with Data-Science.

## Formatting

- Use Title-Case with hyphens: `Space-Opera`, not `space opera` or `Space Opera`.

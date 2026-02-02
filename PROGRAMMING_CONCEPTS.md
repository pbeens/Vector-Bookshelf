# programming concepts

A guide to the computer science concepts powering **Vector Bookshelf**. This document explains *how* the code works and *why* specific technical decisions were made, targeted at students with a basic understanding of programming.

---

## Chapter 1: High-Level Architecture

### The Client-Server Model

Vector Bookshelf is built as a **Full-Stack Application**, meaning it has two distinct parts that talk to each other.

1. **The Frontend (Client)**: This is the user interface you see in the browser. It's built with **React**. It handles button clicks, scrolling, and displaying data. It *cannot* touch the files on your computer directly.
    - *Location:* `src/App.jsx`, `src/components/`
2. **The Backend (Server)**: This is a **Node.js** program running silently in the background. It *can* read files, write to the database, and run the AI. It listens for commands from the Frontend.
    - *Location:* `src/server/index.js`, `src/server/db.js`

**Data Flow Diagram:**

```
[ Browser (React) ]  <-- HTTP Requests (JSON) -->  [ Node.js Server ]  <---->  [ SQLite Database ]
      |                                                     |
    User Clicks                                        Reads/Writes
   "Scan Books"                                       Files on Disk
```

### Why Separate Them?

You might ask, "Why not just write one big program?"

- **Security**: Browsers are "sandboxed"—they can't just delete files on your hard drive for safety. The Backend acts as a secure doorman.
- **Responsiveness**: The Frontend stays smooth (60 frames per second) while the Backend does the heavy lifting (like crunching 500 books through an AI).

---

## Chapter 2: Key Libraries & "Why?"

We didn't write everything from scratch. We stood on the shoulders of giants.

### 1. React (The View Layer)

- **What it does:** Lets us build the UI out of reusable "Components" (like a `<BookRow />`).
- **Why we chose it:** In plain JavaScript, updating a list of 10,000 books is hard—you have to manually add/remove HTML elements. React uses a **Virtual DOM** to calculate exactly what changed and only updates those parts. This makes sorting 30,000 books feel instant.

### 2. better-sqlite3 (The Database Driver)

- **What it does:** Allows Node.js to talk to our `library.db` file.
- **Why we chose it:** Most Node.js database libraries are *asynchronous* (they use callbacks). `better-sqlite3` is **synchronous**.
  - *Why that matters:* For a local app, waiting for a database read is practically instant (micro-seconds). Writing code like `const user = db.prepare('SELECT * FROM users').get()` is much simpler and faster than awaiting Promises for every tiny read.

### 3. node-llama-cpp (The AI Engine)

- **What it does:** Runs the "Brain" (Large Language Model) directly inside our Node.js process.
- **Why we chose it:**
  - It allows us to using **Quantized Models** (GGUF format), which shrinks a 40GB AI down to 4GB so it runs on a normal laptop.
  - It uses **Functions** (C++ bindings) to talk directly to the CPU/GPU, bypassing the slowness of JavaScript for heavy math.

---

## Chapter 3: Critical Algorithms & Logic

### The "Tag Sieve" (Input Normalization)

**Problem:** The AI isn't perfect. Sometimes it outputs "Sci-Fi", sometimes "sci fi", sometimes "Science Fiction". If we save all these, our filters will be a mess.
**Solution:** `normalizeTag` function in `taxonomy.js`.

**The Logic:**

1. **Lowercase everything**: "Sci-Fi" -> "sci-fi".
2. **Replace separators**: Convert spaces/underscores to hyphens (`-`).
3. **Regex Cleaning**: Remove crazy characters.

**Code:**

```javascript
function normalizeTag(tag) {
    return tag.toLowerCase()
        .replace(/[\s_]+/g, '-')      // "Sci Fi" -> "sci-fi"
        .replace(/[^a-z0-9\-\.]/g, '') // Remove emojis/symbols
        .replace(/^-+|-+$/g, '');     // Trim trailing hyphens
}
```

### Search Implementation (SQL `LIKE`)

**Problem:** How do you find "Asimov" in 30,000 books instantly?
**Solution:** We use the SQL `LIKE` operator with wildcards (`%`).

**Code (from `db.js`):**

```javascript
if (search) {
  // The % symbols mean "match anything before or after"
  // So %Asimov% matches "Isaac Asimov" AND "Asimov's Guide"
  const likeQuery = `%${search.trim()}%`;
  conditions.push('(title LIKE ? OR author LIKE ?)');
  params.push(likeQuery, likeQuery);
}
```

*Complexity Note:* This is `O(n)` (linear time) for SQLite. For 30k books, it's fast enough (~10ms). For 1 million books, we would need a "Full Text Search (FTS)" index.

---

## Chapter 4: Database Design

### The Schema

Think of a Database Table like a super-powered Excel sheet. Our `books` table schema:

- `id` (Integer): Unique ID for every book (Primary Key).
- `filepath` (Text): The exact location on disk (Unique).
- `tags` (Text): A simple comma-separated string `Space-Opera, Fiction`.
- `master_tags` (Text): High-level categories determined by AI `Science-Fiction`.

### A.C.I.D. and Transactions

**Concept:** A **Transaction** ensures that a group of actions *all happen* or *none happen*.
**Analogy:** Mailing a letter. You put it in the box. You can't "half-mail" it. It's either in the system or it isn't.

**In Our Code:**
When we update the taxonomy, we might change 500 books at once. We wrap this in a transaction (`db.transaction`).

- If the computer loses power on book 250, the database **rolls back** to the state before book 1.
- This prevents "Corrupted Data".

### WAL Mode (Write-Ahead Logging)

We enabled: `db.pragma('journal_mode = WAL');`
**Why?**

- Standard SQLite locks the *entire file* when writing. So if the AI is writing a tag, the UI can't read the book list.
- **WAL Mode** writes changes to a separate little file (the "Log") first. This allows readers (the UI) and writers (the AI) to work **at the same time**.

---

## Chapter 5: Advanced Patterns Used

### 1. The Singleton Pattern

**Definition:** Restricting a class to only have *one single instance* across the entire application.
**In Context:** The AI Model (`tagger.js`).
Loading the AI into RAM takes 5-10 seconds and uses 6GB of memory. We specificially check `if (!llamaInstance)` before loading it. If `tagger.js` is imported by 5 different files, they all share the **same, single** AI brain.

```javascript
let llamaInstance = null; // The "Instance"

export async function getLlamaManager() {
    if (!llamaInstance) {
        // Only created ONCE
        llamaInstance = await getLlama();
    }
    return llamaInstance;
}
```

### 2. Server-Sent Events (SSE) (The Observer Pattern)

**Definition:** A one-way communication channel where the server pushes updates to the client.
**In Context:** The Progress Bar.
When scanning, we don't want the frontend to ask "Are we there yet?" every second (Polling).
Instead, the Backend keeps a connection open and *pushes* messages: "Processed book 5", "Processed book 6"...

**Code (`App.jsx`):**

```javascript
// We open a stream reading data chunk by chunk
const reader = response.body.getReader();
while (true) {
  const { value } = await reader.read();
  // Decode the message and update the Progress Bar state
  const data = JSON.parse(decoder.decode(value));
  setStats(data); 
}
```

This is a form of the **Observer Pattern**: The Frontend *observes* the stream, and reacts whenever the Backend *notifies* it.

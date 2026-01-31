# programming_concepts.md

**Target Audience:** AP Computer Science Students (Grade 11-12)
**Goal:** understand how a production-grade application bridges the gap between "Learning Code" and "Shipping Code."

---

## Chapter 1: High-Level Architecture

### 1.1 The Client-Server Model

In class, you often write programs where the GUI and logic are one file (e.g., a Python Tkinter script). In the real world, we split them.

* **The Frontend (Client):** `src/client/App.jsx`. Built with **React**. It runs in your browser. It handles what you *see* (interactivity, CSS, buttons).
* **The Backend (Server):** `src/server/index.js`. Built with **Node.js** and **Express**. It runs on your computer's OS. It handles what you *save* (files, database, AI processing).

**Why separate them?**
If the frontend handled the database directly, it would risk corrupting the file if the browser crashed. By mediating through a Server API (`/api/books`), we ensure the database is only touched by a stable, predictable process.

### 1.2 Data Flow Diagram

When you search for a book, this happens:

1. **User:** Types "Harry Potter" in the React Search Bar.
2. **React:** Sends an HTTP GET request to `http://localhost:3001/api/books?q=Harry`.
3. **Express (Server):** Receives the request.
4. **Database:** Runs SQL: `SELECT * FROM books WHERE title LIKE '%Harry%'`.
5. **Response:** The server sends a JSON list `[{ title: "Harry Potter" }]` back to React.
6. **React:** Updates the `books` state variable, triggering a re-render to show the cover.

---

## Chapter 2: Key Libraries & The "Why?" Rule

We didn't write everything from scratch. Here’s why we chose these specific tools.

### 2.1 `better-sqlite3` (The Database Driver)

* **What it is:** A library that lets Node.js talk to SQLite database files (`library.db`).
* **Why we chose it:** Most Node.js database drivers are *asynchronous* (Promise-based). This is great for web servers handling 10,000 users, but for a local app, it adds unnecessary complexity. `better-sqlite3` is **synchronous** (blocking).
* **The Win:** It makes our database interaction code look like simple sequential programming (easy to debug) and is actually **faster** for local files because it skips the JavaScript Event Loop overhead.

### 2.2 `express` (The Web Server)

* **What it is:** A framework for handling HTTP requests (`GET`, `POST`).
* **Why we chose it:** Vanilla Node.js specific HTTP handling is verbose. Express lets us write clean "routes":

    ```javascript
    app.get('/api/books', (req, res) => { ... })
    ```

    This is the industry standard for Node.js backends.

---

## Chapter 3: Critical Algorithms & Logic

### 3.1 The "Tag Sieve" (Adaptive Taxonomy)

**File:** `src/server/taxonomy.js`

**The Problem:** We collect thousands of messy tags ("Sci-Fi", "sci-fi", "Space Opera", "1990s"). Asking an AI to categorize *every single one* would be slow and cost money.

**The Solution:** A Multi-Layer Filter (The Sieve).
We filter data through cheap rules before using expensive AI.

1. **Normalization (Layer 0):**
    * **Logic:** Convert input to a canonical key.
    * **Code:** `tag.toLowerCase().replace(/[\s_]+/g, '-')`
    * **Result:** "Sci Fi" and "sci-fi" both become `sci-fi`. Eliminate duplicates immediately.

2. **The Rules Engine (Layer 1):**
    * **Logic:** Use **Regular Expressions (Regex)** to catch structural patterns.
    * **Code:**

        ```javascript
        function classifyTagByRules(tag) {
            // Check for 4 digits (Years) -> History
            if (/^\d{4}s?$/.test(tag)) return 'History'; 
            // Check for programming languages
            if (/^(js|python|c\+\+)$/.test(tag)) return 'Computer-Science';
        }
        ```

    * **Complexity:** O(1) (Constant time). Instant.

3. **AI Fallback (Layer 2):**
    * **Logic:** Only if the Regex returns `null`, we add the tag to a "To Learn" batch.
    * **Why?** This reduces the AI workload by ~80%, making the scan feel instant for most libraries.

---

## Chapter 4: Database Design (A.C.I.D.)

### 4.1 The Schema

We use a **Relational Database**.

* **Books Table:** Stores `title`, `author`, `filepath`.
* **Constraint:** `filepath TEXT UNIQUE`. This prevents the same file from being added twice, even if you scan the folder 50 times.

### 4.2 WAL Mode (Write-Ahead Logging)

**File:** `src/server/db.js`

```javascript
db.pragma('journal_mode = WAL');
```

* **The Concept:** Normally, a database is a single file. If you write to it, you lock it (nobody can read).
* **The Problem:** If our "Scanner" is initializing 5,000 books, the "UI" (User) would be frozen for minutes.
* **The Solution (WAL):** Writers write to a separate `-wal` file. Readers read from the main file. They don't block each other.
* **Analogy:** Imagine a library. Without WAL, if a librarian is adding a new book, they close the front door. With WAL, they write the new book to a notepad (the log) first, allowing students to keep browsing the shelves.

### 4.3 Transactions (Atomicity)

When we apply categories to 5,000 books, we don't assume it will work. We wrap it in a **Transaction**.

```javascript
const runTransaction = db.transaction((operations) => {
   for (op of operations) op();
});
```

* **A.C.I.D. Concept:** **Atomicity**. Either *all* 5,000 updates happen, or *none* of them happen.
* **Why?** If the power goes out at book #2,500, we don't want a "half-categorized" database. The database will roll back to the clean state automatically.

---

## Chapter 5: Advanced Patterns

### 5.1 Singleton Pattern (The Database Connection)

We create the database connection *once* in `db.js` and export that single instance.

```javascript
// db.js
const db = new Database('library.db');
export { db };
```

**Why?** Opening a database connection is "expensive" (takes time/memory). By using a Singleton, every part of our app (Scanner, API, Tagger) shares the same open line, preventing memory leaks.

### 5.2 Server-Sent Events (SSE) - The "Push" Pattern

Normally, the client "Pulls" data (asks for it). But during a scan, the server needs to "Push" progress updates ("Scanned file 10 of 100...").

**Implementation:**
We use a streaming HTTP response.

1. **Server:** Writes `data: {"progress": 10}\n\n` to the response stream but *keeps the connection open*.
2. **Client:** Reads the specific byte stream, decoding chunks as they arrive.

**Analogy:**

* **Regular HTTP:** You mail a letter and wait for a reply.
* **SSE:** You open a phone call. The other person keeps talking ("10% done... 20% done...") until they hang up.

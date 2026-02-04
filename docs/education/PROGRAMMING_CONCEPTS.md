# Programming Concepts in Vector Bookshelf

**Created:** 2026-02-03

Welcome to the educational guide for **Vector Bookshelf**. This document is designed for Grade 11 and 12 Computer Science students who want to understand how a "real-world" application uses the concepts learned in class.

By exploring this codebase, you'll see how theoretical ideas like **Recursion**, **Singleton Patterns**, and **Database Atomicity** are applied to solve practical problems in AI-driven data management.

---

## Chapter 1: High-Level Architecture

### The Client-Server Model

**Textbook Definition:** A distributed application structure that partitions tasks or workloads between the providers of a resource or service, called servers, and service requesters, called clients.

**In-Context Explanation:**
Vector Bookshelf uses a Client-Server model even though it runs entirely on one machine.

1. **The Client (Frontend):** Built with **React**, this is the user interface you see in your browser. It sends "requests" to the backend.
2. **The Server (Backend):** Built with **Node.js** and **Express**, this handles the "heavy lifting"—reading files, talking to the database, and running the AI model.

**Why separate them?**
Separation of concerns. The frontend only cares about how things *look* and how users *interact*. The backend only cares about *data integrity* and *performance*. This makes the code easier to debug and maintain. If we wanted to put the database on a different computer later, the frontend wouldn't even need to be changed!

**Data Flow Diagram:**

```text
[ User Clicks "Scan" ] -> [ Frontend (React) ] 
       |
       v
[ HTTP POST Request ] -> [ Backend (Express) ] 
       |
       v
[ File System / AI ]  <- [ SQLite Database ]
```

**Analogy:**
Think of a restaurant. The **Client** is the customer at the table. The **Server** is the kitchen. The customer doesn't need to know how the stove works; they just place an order and wait for the result. The waiter (the API) carries the order to the kitchen and the food back to the customer.

---

## Chapter 2: Key Libraries & "Why?"

### React (Frontend Framework)

**Textbook Definition:** A declarative, component-based JavaScript library for building user interfaces.

**In-Context Explanation:**
In vanilla JavaScript, if you want to update a list of 1000 books, you have to manually find the HTML elements and change them. This is slow and error-prone. React uses a **Virtual DOM**. You just tell React "here is the list of books," and it automatically calculates exactly which parts of the screen need to change. This is called **Declarative Programming**.

### better-sqlite3 (Database)

**Textbook Definition:** A synchronous, high-performance library for interacting with SQLite databases in Node.js.

**In-Context Explanation:**
Most databases are "asynchronous," meaning the program has to wait for a response. In a local-first desktop app, we want the database to be as fast as a local variable. `better-sqlite3` was chosen because it allows us to run complex SQL queries with almost zero overhead, keeping the app snappy even with 30,000+ books.

**Code Snippet:**

```javascript
import Database from 'better-sqlite3';
const db = new Database('library.db');

// Selecting data is synchronous and simple
const count = db.prepare('SELECT COUNT(*) as c FROM books').get().c;
console.log(`Initial count: ${count}`);
```

### node-llama-cpp (AI Engine)

**Textbook Definition:** A wrapper for `llama.cpp` that allows Node.js applications to run Large Language Models (LLMs) locally on the CPU or GPU.

**In-Context Explanation:**
This is the "brain" of the project. We chose this over a cloud API (like OpenAI) for two reasons:

1. **Privacy:** Your book summaries never leave your computer.
2. **Cost:** It's 100% free to run, forever.
3. **Offline capability:** You can organize your library without an internet connection.

---

## Chapter 3: Critical Algorithms & Logic

### Recursive Directory Scanning

**Textbook Definition:** A process in which a function calls itself to solve a smaller version of a problem until it reaches a base case.

**In-Context Explanation:**
To find books inside folders that are inside *other* folders, we use recursion. The scanner looks at a directory: if it finds a file, it adds it; if it finds another folder, it calls itself on that folder. The "Base Case" is when the directory contains no more folders.

**Code Snippet:**

```javascript
async function getFiles(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(dirents.map((dirent) => {
    const res = path.resolve(dir, dirent.name);
    // RECURSION: If it's a directory, call itself!
    return dirent.isDirectory() ? getFiles(res) : res;
  }));
  return Array.prototype.concat(...files);
}
```

**Analogy:**
Think of searching for a specific toy in a nested set of Russian nesting dolls. You open the first doll; if it contains a smaller doll, you repeat the process until you find the treasure or an empty doll.

### The Tag Sieve (Normalization)

**Textbook Definition:** Data normalization is the process of organizing data in a database to reduce redundancy and improve data integrity.

**In-Context Explanation:**
The AI model synthesizes tags and summaries exclusively from the book's content (it never relies on existing file metadata for these fields). Because its output can vary—returning "science fiction", "Sci-Fi", or "SCIENCE FICTION"—we use a "Sieve" (a normalization function) to force every tag into a standard `Pascal-Case-With-Hyphens` format. This ensures that different AI variations are merged into one single, clean category in your database.

**Code Snippet:**

```javascript
function normalizeTag(tag) {
    if (!tag) return '';
    return tag
        .trim()
        .split(/[\s_-]+/) // Split by space, underscore, or hyphen
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('-');
}
```

### Search Ranking (Score-Based Filtering)

**Textbook Definition:** An algorithm that calculates the relevance of a record to a given query.

**In-Context Explanation:**
Instead of a simple "yes/no" search, Vector Bookshelf scores each book based on how many tokens match the title, author, and tags. This allows us to sort results so the most relevant books appear at the top.

---

## Chapter 4: Database Design

### The SQLite Schema

**Textbook Definition:** The formal structure of a database, defined by a set of rules and relationships.

**In-Context Explanation:**
Our `books` table is the heart of the app. It stores the `filepath` (the unique identifier), the AI-generated `tags`, and `locked_fields` (to prevent AI from overwriting your manual edits).

### WAL Mode (Write-Ahead Logging)

**Textbook Definition:** A method for providing atomicity and durability (two of the ACID properties) in database systems.

**In-Context Explanation:**
In a research tool, the AI might be writing a new summary while the user is trying to search for a book. Standard databases might "lock" the file, causing the UI to freeze. WAL mode allows the AI to write to a "log" file while the user reads from the main database, preventing conflicts and ensuring the UI remains smooth.

**Analogy:**
Imagine a public bulletin board. Standard mode is like taking the whole board down to post one note. WAL mode is like writing your note on a sticky note and handing it to an usher who puts it on the board later, so people can keep reading the board in the meantime.

### ACID Properties

**Textbook Definition:** Atomicity, Consistency, Isolation, Durability - a set of properties that guarantee database transactions are processed reliably.

**In-Context Explanation:**
When we update a book's metadata, we want to be 100% sure that *either* all the updates happen *or* none of them do. This prevents "partial data" (like a book having a new title but an old author) if the power goes out mid-save.

**Code Snippet:**

```javascript
export const runTransaction = (fn) => {
  const transaction = db.transaction(fn);
  return transaction();
};
```

---

## Chapter 5: Advanced Patterns Used

### The Singleton Pattern

**Textbook Definition:** A design pattern that restricts the instantiation of a class to one single instance.

**In-Context Explanation:**
Opening a database connection or loading an AI model is "expensive" in terms of memory and time. We don't want to open 50 connections to the same file. Instead, we create a **Singleton**—one single instance that is cached and shared by the entire application.

**Code Snippet:**

```javascript
// db.js
const db = new Database(DB_PATH);
export default db; // Every other file imports THIS SAME instance
```

### Server-Sent Events (Observer Pattern)

**Textbook Definition:** A server push technology enabling a browser to receive automatic updates from a server via an HTTP connection.

**In-Context Explanation:**
When the backend is scanning 1,000 books, the frontend needs to know the progress. instead of the frontend asking "Are we done yet?" every second (Polling), the backend uses **SSE** to "push" updates whenever a new book is found. This is a form of the **Observer Pattern**, where the UI "observes" the backend's scan state.

**Code Snippet:**

```javascript
// Backend (index.js)
res.setHeader('Content-Type', 'text/event-stream');
onProgress: (stats) => {
    res.write(`data: ${JSON.stringify({ type: 'progress', ...stats })}\n\n`);
}
```

### State Management (React Hooks)

**Textbook Definition:** The process of managing the data that a program uses and how that data changes over time.

**In-Context Explanation:**
We use `useState` and `useEffect` to manage everything from the search query to the current scan progress. When the state changes, React rerenders the UI. Understanding the "Lifecycle" of a component (Mounting, Updating, Unmounting) is key to building complex apps like this.

---

## Chapter 6: The User Interface & User Experience (UI/UX)

### Force-Directed Graphs

**Textbook Definition:** A class of algorithms for drawing graphs in an aesthetically pleasing way.

**In-Context Explanation:**
The "Library Graph" uses physics (attraction and repulsion) to cluster books together. This is a visual representation of **Semantic Relationships**. Books with similar tags "pull" toward each other, while unrelated books "push" away.

### Windowing (Virtualization)

**Textbook Definition:** A technique for rendering only the items that are currently visible on the screen.

**In-Context Explanation:**
If you have 50,000 books, a browser cannot render 50,000 HTML rows without crashing. We use **Virtualization** to only create the 15-20 rows you can actually see. This keeps the scroll performance buttery smooth at 60 frames per second.

---

## Exercises for Students

1. **Complexity Analysis:** What is the Big O time complexity of the Recursive Directory Scanner? (Hint: Think about how many times the function is called per file).
2. **Logic Challenge:** Modify the `normalizeTag` function to use `snake_case` instead of `Pascal-Case`. How does this change the database entries?
3. **Trace a Request:** Find the code in `App.jsx` that calls `fetch('/api/books')`. Trace exactly what happens in `index.js` and `db.js` when that call is made.
4. **Data Design:** If we wanted to add "Cover Art" to each book, what new column would you add to the `books` table? Why?

---
*Created as an educational resource for Vector Bookshelf. Use this guide to connect your classroom learning to real-world software engineering.*

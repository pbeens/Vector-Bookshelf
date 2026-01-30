# Vector Bookshelf

A high-end research tool that treats a directory of books as a raw knowledge base, extracting its own metadata, relationship intelligence, and AI-derived classifications.

> [!IMPORTANT]
> **AI Requirement:** This project currently requires **[LM Studio](https://lmstudio.ai/)** to be installed and running locally (Server Mode on port `1234`) to power the AI tagging and summarization features.
>
> *Support for cloud-based LLM APIs (OpenAI, Anthropic, etc.) is planned for a future release.*
>
> *Note: This repository also includes development support files, such as custom `skills/` configurations, to assist with agentic development workflows.*

## 🛠 Tech Stack

- **Frontend:** React (Vite) + Tailwind CSS v4
- **Backend:** Node.js (Express)
- **Database:** SQLite (with WAL mode for robustness)
- **AI Integration:** LM Studio (Local LLM Server)
- **Core Libraries:** `epub2` (EPUB parsing), `pdf-parse` (PDF analysis)

## 🚀 How It Works

The system operates in **Phases** to ensure performance and data integrity.

### The 3-Step Import Process

**1. Add Books (Scan Library)**

- Click "Scan Library" to identify files.
- Extracts basic metadata (Title, Author, Year) from file headers.
- **Result:** Books appear in the list but lack tags/summaries.

**2. AI Data Scan**

- Click "AI Data Scan" to process book content.
- Reads the first **5000 characters** (Preface/Intro) of each book.
- Sends text to LM Studio to generate specific tags and a summary.
- **Result:** Books get rich tags (e.g., "Space-Opera", "Python") and summaries.

**3. Rescan Categories**

- Click "Rescan Categories" to organize your library.
- AI analyzes all your unique tags and groups them into high-level Categories.
- **Fiction/Non-Fiction** is automatically assigned as the first category based on specific genres.
- **Result:** Books are assigned up to 3 Categories (e.g., "Fiction, Science-Fiction, Space-Opera") for easy filtering.

## ✨ UI Features

- **Smart Search & Filtering:** Instantly search by Title, Author, or Tag. Filter by Publication Year. Results update in real-time.
- **Adaptive Categories:** The system "learns" from your tags to create high-level categories (e.g., "Fiction", "Science-Fiction", "History").
- **Manual Metadata Editing:** Hover over any Title/Author to see a ✎ pencil. Click to edit inline. Edits are **locked** and safe from auto-scans.
- **Bulk Export:** Filter your library (e.g., "Fiction" + "Neil Gaiman") and export the actual files to a folder of your choice.
- **Author Filtering:** Click any author name to filter the library. Combine multiple authors and tags for precise searches.
- **Interactive Hover Summaries:** Hover over any title to see an AI-generated summary tooltip.
- **"Scan Now" Tooltip Action:** Process individual books instantly without a full library scan.
- **Clickable Filenames:** Click any filename in the library table to open its containing folder in Windows Explorer.
- **Error Reporting:** Built-in "Export Errors" tool generates a text file report of all corrupted or skipped books for easy cleanup.
- **Real-time Stats:** Live tracking of detected files, added books, metadata extraction, and failures.
- **Glassmorphism UI:** Modern, premium aesthetic with smooth transitions and stable layouts.

## 🧹 Maintenance Commands

The project includes built-in automation to help with testing, cleanup, and documentation:

- **`/restart-server`**: Stops all Node.js processes and restarts both the backend and frontend servers.
- **`/wipe-db`**: Stops all servers, deletes the database files, and restarts the backend/frontend stack from scratch.
- **`/update-docs`**: Updates `DEVELOPMENT_LOG.md` and `README.md` to reflect current project state and recent changes.

## 🔮 Future Roadmap

- **Cloud/External LLM API Support:** Allow users to switch from local LM Studio to OpenAI, Anthropic, or DeepSeek APIs for faster processing without high-end GPU requirements.

## 📦 Project Setup

1. **Install Dependencies**

    ```bash
    npm install
    ```

2. **LM Studio Configuration**

    - Ensure LM Studio is running
    - Start the "Local Server" on port `1234`
    - Load an appropriate model for your GPU
    - **Set context window to at least 6144 tokens** (Settings → Context Length)
      - The AI scan sends ~5000 characters + system prompt
      - If you get "cannot truncate prompt" errors, increase context window or reduce `MAX_CONTENT_CHARS` in `src/server/tagger.js`

    **Model Recommendations by GPU Memory:**

    - **12GB VRAM** (Tested): Gemma 3 12B - Excellent balance of speed and quality
    - **16GB+ VRAM**: Llama 3.1 8B Instruct (GGUF Q6_K or higher) or Gemma 3 12B
    - **8GB VRAM**: Llama 3.2 3B or Phi-3 Mini (4B)
    - **6GB VRAM**: Gemma 2 2B or TinyLlama 1.1B

    > **Note:** The system works with any OpenAI-compatible local LLM. Larger models produce better tags and summaries but process slower.

3. **Start Development Environment**

    ```bash
    # Frontend (Vite)
    npm run dev

    # Backend (Express API)
    node src/server/index.js
    ```

4. **Access UI**
    Visit `http://localhost:5173/`

## 🐛 Feedback & Support

Found a bug? Have a feature idea?
Please create a new **Issue** in this repository. We welcome feedback to make Vector Bookshelf better!

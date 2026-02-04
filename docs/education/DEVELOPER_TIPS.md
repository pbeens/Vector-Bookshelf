# Developer Tips: Vector Bookshelf

This document contains practical guidance for developers working on the Vector Bookshelf codebase, especially when using Antigravity (AI agent) workflows or transitioning between Web and Desktop environments.

---

## 0. Architectural Context: Desktop-Only

**Vector Bookshelf is an Electron-based desktop application.**

While the project uses a standard web stack (React/Vite/Express), it is architected to run **exclusively as a desktop app**.

- **Browser-only execution is unsupported.** The UI relies on Electron IPC to communicate with the filesystem (e.g., folder pickers).
- **Testing in a browser** (via `npm run dev`) will result in a non-functional experience for core features. Always test using the Electron environment.

### 🛠️ Common Fix: Native Module Rebuild

If you see an error like `Could not locate the bindings file` or `ERR_DLOPEN_FAILED` for `better-sqlite3` while running the Desktop app, it means the binary was compiled for the wrong environment (Node vs Electron).

Run this command from the project root to fix it:

```powershell
# Rebuild native modules specifically for the included Electron version
npm run rebuild -w apps/api
```

*(If that script is missing, run: `npx electron-rebuild -f -w better-sqlite3` inside `apps/api`)*

---

## 1. Source Code vs. Build Artifacts

Understanding where to make changes and where the app is "reading" from is critical to avoid "why isn't my change appearing?" frustration.

### The Source (`apps/`)

- **`apps/api`**: The Node.js backend logic, database management, and AI scanners.
- **`apps/web`**: The React frontend (React, Tailwind, Lucide icons).
- **`apps/desktop`**: The Electron wrapper, system integration (folder pickers), and IPC handlers.

### The Artifacts (`dist/`)

- **`apps/web/dist/`**: The compiled static HTML/JS/CSS. **The Desktop app typically loads these files.** If you modify React code but don't run `npm run build` in the `web` workspace, the Desktop app will still show the old version.
- **`apps/desktop/dist/win-unpacked/`**: A "portable" version of the application created by `electron-builder`.
  - **IMPORTANT**: This is a static snapshot. Running a "Dev Run" (`npm start`) does **not** update this folder. If you are testing by launching the `.exe` inside `win-unpacked`, you are testing old code.

---

## 2. Ways the App Can Be Run

| Mode | Command (Root or Workspace) | Description |
| :--- | :--- | :--- |
| **Desktop Dev Run** | `npm start -w apps/desktop` | **Primary Workflow.** Runs Electron directly from source. |
| **Pack Run** | `npm run pack -w apps/desktop` | Updates `win-unpacked` and runs it. Use this to verify packaging/assets. |
| **Installed** | Launch via Start Menu | Uses the version in `%LocalAppData%`. Avoid using this for testing. |

### How to Tell What's Running

Check the **Window Title Bar** or the **Diagnostics Utility**:

- **DEV**: Title starts with `Vector Bookshelf Dev` and shows a Build Number (e.g., `Build 42`).
- **PACKED**: Title starts with `Vector Bookshelf` and shows the `AppData` path prefix.

---

## 3. Common Points of Confusion

### "I changed the code but the app didn't change."

- **Check the Mode**: Are you running from `win-unpacked`? If so, you must re-run the `pack` script.
- **Check the Web Build**: If using the Desktop Dev Run, ensure you have run `npm run build` in `apps/web` so the API can serve the latest static assets.

### "Where did my books go?" (Multiple AppData Folders)

To prevent development tests from corrupting your actual library, the app uses different storage locations:

- **Production**: `%AppData%\VectorBookshelf`
- **Development**: `%AppData%\VectorBookshelf Dev`
If you add books in one mode, they will not appear in the other.

### Native Module Errors (`better-sqlite3`)

If you see `ERR_DLOPEN_FAILED` or similar, it usually means your local Node.js version has changed since the dependencies were installed.

- **Fix**: Run `npm rebuild better-sqlite3 -w apps/api` or `npm install`.

---

## 4. Recommended Diagnostics

Always verify your environment before reporting or debugging a "bug":

1. **Check System Utilities > App Diagnostics**:
   - Verify the **Mode** (Packaged vs Development).
   - Check the **User Data Path** to ensure you are looking at the correct database.
   - Note the **Build ID** to confirm the agent successfully updated the binary.

2. **Console Logs**:
   - In Desktop Dev mode, backend logs appear in your terminal.
   - Frontend logs appear in the Electron DevTools (`Ctrl+Shift+I`).
   - A persistent log is also kept at `%AppData%\...Dev\server_debug.log`.

---

## 5. Agent-Assisted Workflows

When working with Antigravity:

- **Be Explicit**: If you want the agent to test a packed build, tell it to "Pack and Run". If you want the fastest loop, ask for a "Dev Run".
- **Path Awareness**: Remember that the agent sees absolute paths. If you move the project, the agent might need a moment to re-index the new location.

---

## 6. Production Builds & Distribution

### 📦 Building for Windows (Current OS)

To create a final installable `.exe` for distribution:

1. **Build the Frontend**:

    ```powershell
    npm run build -w apps/web
    ```

2. **Package the App**:

    ```powershell
    npm run dist -w apps/desktop
    ```

3. **Locate the Installer**:
    The setup file (e.g., `Vector Bookshelf Setup 1.0.0.exe`) will be in:
    `apps/desktop/dist/`

### 🍎 Building for macOS

To create a `.dmg` or `.app` file:

1. **Requirement**: You must run this command **on a macOS machine**.
2. **Command**:

    ```bash
    npm run dist -w apps/desktop
    ```

### 🐧 Building for Linux

To create an `.AppImage` or `.deb`:

1. **Requirement**: Run this on a Linux machine (or inside a Docker container).
2. **Command**:

    ```bash
    npm run dist -w apps/desktop
    ```

---

## 7. Publishing a Release

Because the project relies on manual building (no CI/CD pipeline enabled), releases must be created manually on GitHub.

### Steps to Release

1. **Generate Installer**: Follow the "Building for Windows" steps above to generate the `.exe`.
2. **Draft Release**: Go to the [GitHub Releases Page](https://github.com/pbeens/Vector-Bookshelf/releases).
3. **Tag**: Create a new tag (e.g., `v1.0.0`).
4. **Description**: Copy the relevant section from `CHANGELOG.md`.
5. **Upload Binary**: Drag and drop the `Vector Bookshelf Setup X.X.X.exe` file (from `apps/desktop/dist/`) into the release assets.
6. **Publish**: Click **Publish release**.

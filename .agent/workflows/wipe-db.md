---
description: Wipe the library database and restart backend/frontend servers
---

// turbo-all

1. Stop all Node.js processes

```powershell
taskkill /F /IM node.exe
```

1. Delete database files

```powershell
Remove-Item library.db, library.db-wal, library.db-shm -ErrorAction SilentlyContinue
```

1. Start Backend Server

```powershell
node src/server/index.js
```

1. Start Frontend Server

```powershell
npm run dev
```

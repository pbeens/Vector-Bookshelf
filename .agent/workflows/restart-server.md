---
description: Restart both backend and frontend servers
---

// turbo-all

1. Stop all Node.js processes

```powershell
taskkill /F /IM node.exe
```

1. Start Backend Server

```powershell
node src/server/index.js
```

1. Start Frontend Server

```powershell
npm run dev
```

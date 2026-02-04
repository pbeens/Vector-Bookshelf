---
description: Run the desktop app from source (non-EXE loop).
---
1. Build the frontend (Required for UI)
   // Ensures apps/web/dist exists
   cd apps/web
   npm run build

2. Navigate to the desktop app directory
   cd ../../apps/desktop

3. Start the application
   // This uses the existing 'start' script which runs 'electron .'
   npm start

# Wipe Database Skill

This skill allows the agent to quickly reset the application state.

## Instructions

1. Stop all Node.js processes to release file locks on the database.
2. Delete the `library.db` and its associated WAL/SHM files.
3. Restart the backend server.
4. Restart the frontend development server.

## Usage

Run the `/wipe-db` workflow to trigger this sequence automatically.

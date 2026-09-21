# Contributing to HomeLab OS

This document outlines the guidelines and coding standards for submitting contributions to this repository.

---

## 1. Code of Conduct

All contributors are expected to adhere to the project's [Code of Conduct](CODE_OF_CONDUCT.md) during interactions.

---

## 2. Getting Started

### Local Setup
Requires Node.js 20 or newer.
1. Clone the repository.
2. Start the backend control plane, which also serves the frontend:
   ```bash
   cd dashboard/backend
   npm install
   npm run dev
   ```
3. Open `http://localhost:8081` in a web browser and create the administrator account on first run. In development `JWT_SECRET` and `ENCRYPTION_KEY` fall back to development values (the server does not read `.env` itself; export variables in your shell or use the Docker Compose setup, see `dashboard/backend/.env.example` for the list).

The frontend is plain ES modules with no build step: edit files under `dashboard/frontend/` and reload the page.

### Checks to run before a pull request
```bash
cd dashboard/backend
npx tsc --noEmit
npm run lint
npm test
```

---

## 3. Pull Request Guidelines

* All changes must undergo testing.
* Commit messages should adhere to the Conventional Commits specification (e.g. `feat(core): ...` or `fix(auth): ...`).
* Keep pull requests focused on a single change.
* Ensure TypeScript compiles cleanly without warnings before submission.

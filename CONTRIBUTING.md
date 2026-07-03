# Contributing to HomeLab OS

This document outlines the guidelines and coding standards for submitting contributions to this repository.

---

## 1. Code of Conduct

All contributors are expected to adhere to the project's [Code of Conduct](CODE_OF_CONDUCT.md) during interactions.

---

## 2. Getting Started

### Local Setup
1. Clone the repository.
2. Initialize the backend control plane:
   ```bash
   cd dashboard/backend
   npm install
   npm run dev
   ```
3. Open `dashboard/frontend/index.html` in a web browser.

---

## 3. Pull Request Guidelines

* All changes must undergo testing.
* Commit messages should adhere to the Conventional Commits specification (e.g. `feat(core): ...` or `fix(auth): ...`).
* Keep pull requests focused on a single change.
* Ensure TypeScript compiles cleanly without warnings before submission.

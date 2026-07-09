# VibeNet Frontend

Next.js client for **VibeNet** — a secure, real-time end-to-end encrypted (E2EE) chat application.

This repository is consumed as a git submodule by the [VibeNet-Main](https://github.com/ChamathDilshanC) monorepo.

## Tech Stack

- **Next.js** (App Router) + **TypeScript**
- **Tailwind CSS** for the app shell
- **[Astryx Design System](https://github.com/facebook/astryx)** (`@astryxdesign/core`) on the **neutral** theme for UI components

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the landing page.

## Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start the development server         |
| `npm run build` | Create an optimized production build |
| `npm run start` | Serve the production build           |
| `npm run lint`  | Run ESLint                           |

## Project Structure

```
src/
  app/
    layout.tsx    # Root layout — loads global styles, activates the Astryx neutral theme
    page.tsx      # Landing page (/) — brand, description, and Login / Register CTAs
    globals.css   # Tailwind + Astryx reset/core/theme imports
```

## Design System

UI is built with Astryx components. The active theme (`neutral`) is enabled via the
`data-astryx-theme="neutral"` attribute on `<html>` in [`src/app/layout.tsx`](src/app/layout.tsx),
and its tokens are imported in [`src/app/globals.css`](src/app/globals.css).

Useful CLI references:

```bash
npx astryx component          # list all components
npx astryx component Button   # props, usage, and theming for a component
npx astryx template --list    # available page templates
npx astryx docs               # documentation topics
```

---

Developed by **Chamath Dilshan** ([@ChamathDilshanC](https://github.com/ChamathDilshanC))

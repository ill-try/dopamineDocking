# Dopamine Docking Lab

An interactive, client-side biology model showing how specific functional-group replacements change contact with a simplified dopamine D2 receptor pocket.

## What to try

- Compare dopamine with 3-methoxytyramine, N-methyldopamine, and tyramine.
- Replace either ring group with OH, OCH₃, or H, or change the amine tail.
- Watch each contact pattern use a different explanatory motion: lock, rock, graze, slide, or deflect.

Selections run immediately, and **Run again** repeats the current encounter.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The static site is written to `dist/client`.

## GitHub Pages

The included workflow builds and deploys the project on pushes to `main`. In the GitHub repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The build automatically adds the repository-name base path for project Pages sites.

The scientific claims, scoring rules, simplifications, and pre-run predictions are documented in [MoleculeResearch.md](MoleculeResearch.md).

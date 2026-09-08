# Dopamine Docking Lab

An interactive, client-side biology model showing how selected dopamine features affect contact with a simplified dopamine D2 receptor pocket.

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

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(projectRoot, 'dist', 'client');
const repositoryName = 'dopamineDocking';
const pagesPrefix = `/${repositoryName}/`;
const pagesUrl = new URL(`https://ill-try.github.io${pagesPrefix}`);
const indexHtml = readFileSync(path.join(outputRoot, 'index.html'), 'utf8');

function localAssetUrls(html) {
  return [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .map((url) => new URL(url, pagesUrl))
    .filter((url) => url.origin === pagesUrl.origin);
}

test('the deployment artifact preserves the .nojekyll marker', () => {
  assert.equal(existsSync(path.join(outputRoot, '.nojekyll')), true);

  const workflow = readFileSync(
    path.join(projectRoot, '.github', 'workflows', 'deploy-pages.yml'),
    'utf8',
  );
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /include-hidden-files:\s*true/);
});

test('all page assets stay inside the GitHub Pages project path', () => {
  const urls = localAssetUrls(indexHtml);
  assert.ok(urls.length > 0, 'expected the export to contain local asset URLs');

  for (const url of urls) {
    assert.ok(
      url.pathname.startsWith(pagesPrefix),
      `${url.href} escapes the ${pagesPrefix} project path`,
    );
  }
});

test('every page asset URL maps to a file in the exported artifact', () => {
  const urls = [...new Set(localAssetUrls(indexHtml))];

  for (const url of urls) {
    const relativePath = url.pathname.slice(pagesPrefix.length);
    assert.equal(
      existsSync(path.join(outputRoot, relativePath)),
      true,
      `${url.href} does not map to an exported file`,
    );
  }
});

test('the contact-map SVG is exported and social metadata uses the Pages URL', () => {
  assert.equal(
    existsSync(path.join(outputRoot, 'dopamine-d2-contact-map.svg')),
    true,
  );
  assert.doesNotMatch(indexHtml, /localhost/);
  assert.match(
    indexHtml,
    /https:\/\/ill-try\.github\.io\/dopamineDocking\/dopamine-d2-contact-map\.svg/,
  );
});

test('the molecule fallback is visible outside canvas before JavaScript starts', () => {
  // Browsers hide canvas children even when JavaScript fails to load.
  const htmlWithoutCanvas = indexHtml.replace(/<canvas\b[^>]*>[\s\S]*?<\/canvas>/g, '');
  assert.match(
    htmlWithoutCanvas,
    /<img\b[^>]*class="canvas-fallback"[^>]*src="\.\/dopamine-d2-contact-map\.svg"/,
  );
});

// Recopie la version de package.json dans extension/manifest.json.
//
// Appelé par le hook `npm version`, donc après le bump et avant le commit :
// `npm version patch` suffit à aligner les deux fichiers et à poser le tag.

import { readFileSync, writeFileSync } from 'node:fs';

const MANIFEST = 'extension/manifest.json';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = readFileSync(MANIFEST, 'utf8');

// Réécriture textuelle plutôt que JSON.stringify : le fichier garde sa mise en
// forme et l'ordre de ses clés, et le diff se limite à la ligne de version.
const next = manifest.replace(/^(\s*"version"\s*:\s*")[^"]*(")/m, `$1${version}$2`);

if (next === manifest) {
  console.error(`Version introuvable ou déjà à ${version} dans ${MANIFEST}`);
  process.exit(1);
}

writeFileSync(MANIFEST, next);
console.log(`${MANIFEST} passé en ${version}`);

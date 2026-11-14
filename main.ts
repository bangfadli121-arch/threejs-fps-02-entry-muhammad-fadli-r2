import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const output = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
mkdirSync(output, { recursive: true });
cpSync(resolve(here, 'game'), resolve(output, 'game'), { recursive: true, force: true });
const shots = resolve(here, 'screenshots');
try {
  mkdirSync(resolve(output, 'screenshots'), { recursive: true });
  cpSync(shots, resolve(output, 'screenshots'), { recursive: true, force: true });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const dossier = buildDossier(output, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(resolve(output, 'dossier.json'), dossier);

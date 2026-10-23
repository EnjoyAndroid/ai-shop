import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { acquireLocalLease, activateLocalPreview, LOCAL_ORIGIN } from './lib/local-runtime.mjs';
import { releaseName, sourceFingerprint, assertDeployable } from './lib/release-policy.mjs';
const id = releaseName(process.argv[2]);
if (process.argv.length !== 3) throw new Error('Usage: npm run preview -- <accepted-release-id>');
const manifest = JSON.parse(readFileSync(`.deploy/releases/${id}/manifest.json`, 'utf8'));
assertDeployable(manifest, sourceFingerprint(), execFileSync('docker', ['image', 'inspect', manifest.imageId, '--format', '{{.Id}}'], { encoding: 'utf8' }).trim());
const release = acquireLocalLease();
try { await activateLocalPreview(manifest); console.log(`Local candidate ${id}: ${LOCAL_ORIGIN}. Same accounts/data as npm run dev.`); }
finally { release(); }

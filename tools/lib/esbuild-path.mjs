// tools/lib/esbuild-path.mjs — where esbuild's binary lives after fetch-deps.
//
// This exists because the answer is platform-dependent and was previously
// written out by hand in three places. Two of them hard-coded `esbuild.exe`,
// so a Linux CI runner would have looked for vendor/esbuild/package/esbuild.exe
// while fetch-deps.mjs had installed vendor/esbuild/package/bin/esbuild — the
// build would have failed on the very first push.
import path from 'node:path';
import url from 'node:url';

export const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..');

export const WIN = process.platform === 'win32';

/** Path of the binary, relative to vendor/esbuild/package. */
export const ESBUILD_REL = WIN ? 'esbuild.exe' : path.join('bin', 'esbuild');

/** Absolute path of the esbuild binary. */
export const ESBUILD = path.join(ROOT, 'vendor', 'esbuild', 'package', ESBUILD_REL);

/** Where fetch-deps.mjs unpacks the esbuild package. */
export const ESBUILD_DEST = path.join(ROOT, 'vendor', 'esbuild');

/** The npm package name for this platform, e.g. @esbuild/linux-x64. */
export function esbuildPackage() {
  const p = process.platform, a = process.arch;
  if (p === 'win32' && a === 'arm64') return '@esbuild/win32-arm64';
  if (p === 'win32') return '@esbuild/win32-x64';
  if (p === 'darwin' && a === 'arm64') return '@esbuild/darwin-arm64';
  if (p === 'darwin') return '@esbuild/darwin-x64';
  if (p === 'linux' && a === 'arm64') return '@esbuild/linux-arm64';
  if (p === 'linux') return '@esbuild/linux-x64';
  throw new Error(`no prebuilt esbuild for ${p}/${a}`);
}

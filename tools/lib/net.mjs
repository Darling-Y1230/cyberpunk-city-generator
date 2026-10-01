// tools/lib/net.mjs — networking that survives a TLS-inspecting proxy.
//
// On a machine with an intercepting proxy (corporate laptop, some AV products,
// CI sandboxes) the proxy's root CA is in the OS certificate store but Node only
// trusts its own bundled list. The symptom is a confusing "unable to verify the
// first certificate" on some hosts and not others — registry.npmjs.org may work
// while api.github.com does not.
//
// Node 24 can opt into the OS store with `--use-system-ca`, but that is a
// process-start flag and cannot be enabled afterwards. This module therefore
// re-executes the script once, and it must be done BEFORE any asynchronous work
// begins: spawning from inside a rejected fetch's catch handler trips a libuv
// assertion on Windows during teardown.
import { spawnSync } from 'node:child_process';
import url from 'node:url';

const CERT_RE = /unable to verify|self[- ]signed|UNABLE_TO_VERIFY|CERT_/i;

const alreadyFixed = () =>
  process.execArgv.includes('--use-system-ca')
  || (process.env.NODE_OPTIONS || '').includes('--use-system-ca');

/**
 * Call this once, first thing, before any `fetch`.
 *
 * Probes TLS in a throwaway child (its exit status is the entire result, so no
 * output is piped) and re-executes this script with --use-system-ca if the
 * machine is intercepting certificates. A no-op everywhere else.
 */
export function ensureTrustedTlsSync(probeUrl = 'https://api.github.com') {
  if (alreadyFixed()) return false;
  const probe = spawnSync(process.execPath, ['-e',
    `fetch(${JSON.stringify(probeUrl)}).then(()=>process.exit(0),()=>process.exit(1))`,
  ], { stdio: 'ignore', timeout: 25000 });

  if (probe.status === 0 || probe.error) return false;

  const self = url.fileURLToPath(url.pathToFileURL(process.argv[1]).href);
  console.error('\n  ! This machine intercepts TLS (a proxy whose root CA is in the OS');
  console.error('    certificate store but not in Node\'s bundled list). Re-running with');
  console.error('    --use-system-ca ...\n');
  const r = spawnSync(process.execPath, ['--use-system-ca', self, ...process.argv.slice(2)],
    { stdio: 'inherit' });
  process.exit(r.status === null ? 1 : r.status);
}

/** fetch(), with network failures reported as one readable line. */
export async function fetchChecked(input, init) {
  try {
    return await fetch(input, init);
  } catch (e) {
    const msg = String((e && e.cause && e.cause.message) || (e && e.message) || e);
    const host = typeof input === 'string' ? new URL(input).host : 'host';
    const extra = CERT_RE.test(msg)
      ? '\n      (TLS interception — re-run with: node --use-system-ca ' + process.argv[1] + ')'
      : '';
    throw new Error(`network error contacting ${host}: ${msg}${extra}`);
  }
}

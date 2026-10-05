# Client security and dependency verification

Verified October 5, 2026.

## Secret and configuration scan

`npm run check:client-security -- --tracked --expo-config --bundle dist`
passed. The scan checks tracked repository files, client source and local
environment files, public build environment values, the resolved Expo public
configuration, and exported JavaScript/source maps. Findings report file names
and reasons without printing matching values.

No service-role credential, provider key, or private key was found. Client
configuration uses the public Supabase URL and publishable key. Added explicit
tracked-file and resolved-configuration scan options. The private-key test
constructs its synthetic marker at runtime to avoid a false secret finding.

Exported Android, iOS, and web JavaScript with source maps using:

`npm run export -- --platform all --source-maps --no-bytecode`

All three exports and their secret scans passed. Source-map module lists show
that `braces`, `node-forge`, and the vulnerable `uuid` package are absent from
all three client bundles. Hermes bytecode generation failed with `spawn UNKNOWN`
in this Windows environment, so this verification uses JavaScript exports.

## Dependency finding repaired

The initial `npm audit --json` reported 60 affected dependency entries:
49 high, 11 moderate, and zero critical. They trace to four underlying
advisories. Expo Router's `query-string` used `decode-uri-component@0.2.2`,
which could hang while parsing malformed URL input.

Overrode that decoder to the maintainer's patched `0.5.0` release. A one-line
`query-string@7.1.3` patch imports the decoder's ESM default export correctly.
`patch-package --error-on-fail` applies the patch during installation. A clean
`npm ci` successfully applied it. Tests confirm normal Unicode/query parameters
and decoding a long malformed input within a bounded subprocess timeout.

Sources: [decoder advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr),
[maintainer release](https://github.com/SamVerschueren/decode-uri-component/releases/tag/v0.5.0).

The final audit reports 59 affected entries: 51 high, eight moderate, zero
critical. The decoder advisory is gone. Remaining entries trace to these three
build/test tool dependencies, which are absent from the exported client:

- `braces@3.0.3`, used by Metro/Jest and patch tooling:
  [high-severity advisory; no published patch](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- `node-forge@1.4.0`, used by Expo CLI/code-signing tools:
  [high-severity advisory; no published patch](https://github.com/advisories/GHSA-86w9-cpqp-85rv).
- `uuid@7.0.3`, used by the native Xcode configuration tool:
  [moderate advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

The full dependency audit remains nonzero. No critical or known affected
runtime client module remains in the scanned exports. Expo SDK 57 versions
were preserved.

## Auth and account isolation

Manually operated an isolated Edge browser against the exported app with two
synthetic accounts and simulated Supabase HTTP responses:

- Opening the breathing deep link while signed out showed sign-in, hid the
  protected screen, and made no progress request.
- Account A restored its three intentions and saved gap-reflection fields.
- Signing out in another tab immediately hid A's reflection and intentions.
- Signing in as B opened B's own writing with no A intentions visible.
- After signing out again, opening Explore still showed sign-in.

Added four browser regression cases covering signed-out deep links, browser
history, ignored external redirect parameters, malformed URL input, and
cross-tab sign-out/account switching from writing, intention results, and gap
reflection. Each account restored only its own data; editing B never changed A.
Existing auth gates and owner checks passed these checks.

Final checks:

- `npm run test:returning-user -- --timeout=30000`: six browser cases passed,
  including both complete Week 1 paths.
- `node --test tests/*.test.cjs`: 53 tests passed.
- `npm test -- --watch=false`: 24 tests passed.
- `npx tsc --noEmit`: passed.

These checks verify the frontend with simulated authentication/persistence.
They do not verify live Supabase policies or physical-device behavior.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

// Exercise the installed CommonJS consumer, not a mock or the decoder alone.
// A child process bounds regressions that would otherwise block the test runner.
const source = String.raw`
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const { createRequire } = require('node:module');
  const consumerRequire = createRequire(require.resolve('query-string'));
  const decoderPath = consumerRequire.resolve('decode-uri-component');
  const version = JSON.parse(fs.readFileSync(path.join(path.dirname(decoderPath), 'package.json'), 'utf8')).version;
  assert.equal(version, '0.5.1', 'Review the override/bridge before changing the decoder');
  const query = require('query-string');
  const parsed = query.parse('name=Salon+%C3%A9tage&key=ha%3Aswitch.lamp&tag=a&tag=b');
  assert.equal(parsed.name, 'Salon étage');
  assert.equal(parsed.key, 'ha:switch.lamp');
  assert.deepEqual(parsed.tag, ['a', 'b']);
  assert.equal(query.parse(query.stringify({key:'ha:switch.lamp',name:'é + 🏠'})).name, 'é + 🏠');
  for (const payload of ['%80'.repeat(4000), '%E0%A4'.repeat(2000), '%FF%41'.repeat(2000)]) {
    assert.equal(typeof query.parse('key='+payload).key, 'string');
  }
  // GHSA-qr28-fpjm-wq7f: 32,000 distinct percent-encoded runs and one malformed
  // sequence (the advisory's 224 KB input) cost 0.5.0 quadratic time. 0.5.1 is
  // linear; the parent timeout below also stops a regressed decoder.
  let distinctRuns = '';
  for (let i = 0; i < 32000; i++) {
    distinctRuns += '%' + (i >> 8).toString(16).padStart(2, '0') + '%' + (i & 255).toString(16).padStart(2, '0') + 'x';
  }
  const started = process.hrtime.bigint();
  assert.equal(typeof query.parse('key=' + distinctRuns + '%zz').key, 'string');
  const distinctRunsMs = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
  assert(distinctRunsMs < 2000, 'Distinct percent-encoded runs must decode in linear time');
  console.log(JSON.stringify({decoder:version,consumer:'query-string@7.1.3',malformedCases:4,distinctRunsMs,validRoundTrips:true}));
`;
const result = spawnSync(process.execPath, ["-e", source], {
  timeout: 5000,
  maxBuffer: 16 * 1024,
  encoding: "utf8",
});
assert.ifError(result.error);
assert.equal(result.status, 0, result.stderr);
console.log(result.stdout.trim());

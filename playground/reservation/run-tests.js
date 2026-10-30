import { spawnSync } from 'node:child_process';
const environment = { ...process.env };
delete environment.NODE_TEST_CONTEXT;
const result = spawnSync(
  process.execPath,
  ['--test', '--test-reporter=tap', 'tests/expanded.test.js'],
  {
    cwd: new URL('.', import.meta.url),
    env: environment,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024
  }
);
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
const count = Number(result.stdout?.match(/^# tests (\d+)$/m)?.[1]);
const forbidden = ['fail', 'cancelled', 'skipped'].some(
  (label) => Number(result.stdout?.match(new RegExp('^# ' + label + ' (\\d+)$', 'm'))?.[1]) !== 0
);
if (
  result.error ||
  result.signal ||
  result.status !== 0 ||
  !Number.isSafeInteger(count) ||
  count < 14 ||
  forbidden
) {
  console.error(
    'Reservation evidence requires at least14 executed tests with zero failures, cancellations or skips.'
  );
  process.exitCode = 1;
}

import '../engine.js';
import '../tests.js';

const results = globalThis.testResults;
for (const result of results) {
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}`);
  if (!result.pass) console.error(result.error);
}
console.log(`\n${results.filter(result => result.pass).length}/${results.length} engine tests passed.`);
console.log(JSON.stringify(globalThis.matchSummaries, null, 2));
if (results.some(result => !result.pass)) process.exitCode = 1;

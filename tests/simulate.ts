// Reads the sample script through a simulated speech recognizer and prints how
// well the old and the new matcher keep up. Run: npm run simulate

import { NewMatcher, OldMatcher, NOISE, SCRIPT, read, follow } from './helpers.ts';
import type { Matcher, Score } from './helpers.ts';

const RUNS = 200;
// Extra near-zone sizes to compare can be passed on the command line.
const NEAR = process.argv.length > 2 ? process.argv.slice(2).map(Number) : [5];
const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);

function average(make: () => Matcher, noise: keyof typeof NOISE, style: 'chrome' | 'safari') {
    const total = { exact: 0, close: 0, ranAhead: 0, worst: 0, finished: 0, lost: 0 };
    for (let seed = 1; seed <= RUNS; seed++) {
        const score: Score = follow(make(), read(SCRIPT, NOISE[noise], seed, style), SCRIPT);
        total.exact += score.exact;
        total.close += score.close;
        total.ranAhead += score.ranAhead;
        total.worst = Math.max(total.worst, score.worst);
        if (score.finished) total.finished++;
        if (score.worst > 15) total.lost++;
    }
    return `точно ${pct(total.exact / RUNS)}  ±2 слова ${pct(total.close / RUNS)}  убежал вперёд ${pct(total.ranAhead / RUNS)}`
        + `  дошёл до конца ${pct(total.finished / RUNS)}  потерялся ${pct(total.lost / RUNS)}  худший отрыв ${total.worst}`;
}

for (const style of ['chrome', 'safari'] as const) {
    for (const noise of Object.keys(NOISE)) {
        console.log(`\n${style}, шум «${noise}», ${RUNS} прогонов`);
        console.log('  старый: ' + average(() => new OldMatcher(SCRIPT), noise, style));
        for (const near of NEAR) {
            console.log(`  новый${NEAR.length > 1 ? ` (near ${near})` : ''}:  ` + average(() => new NewMatcher(SCRIPT, near), noise, style));
        }
    }
}

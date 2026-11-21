# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/0xaline/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/0xaline/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: solve.js reads a CSV text exactly as csv-reader does — broken rows, stray CRs, unterminated quotes and all — and returns the same {columns, rows, errors} on every input, only faster. Unquoted fields are taken with one scan and one slice; only a field that opens with a quote takes the segment path. No dependencies, nothing cached between cases — every call parses its text from scratch.

## Run it

```sh
node main.ts # reads /input/cases.json, writes /output/answers.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=bn1efds8&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>

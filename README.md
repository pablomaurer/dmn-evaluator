# DMN Evaluator
This is another dmn evaluator.

Mostly took the logic from https://github.com/HBTGmbH/dmn-eval-js but with a different feel interpreter https://github.com/nikku/feelin to avoid having moment.js as a dependency.

## Reasons
- Support for DMN Version 1.3
- Avoid having moment.js as a dep
- More modern setup
- Builds commonJS and ESM for usage with node or browser

## Issues
- Still having no tests, apart from the example-node which has mainly a demonstration purpose
- Parses booleans as strings (performance)
- Using labels as input variables
- Missing configurable logger

## Usage
- Look in the example folder

```ts
import { evaluateDecision, parseDmnXml } from 'dmn-evaluater';
import { readFileSync } from 'fs';

// prepare input
const params = {
  age: 29,
  gender: 'm',
  hasGrandchildren: false,
};
const file = '../data/rules1.dmn';
const dmnTable = 'decision_set_1';

// read file and run test function
try {
    const xml = readFileSync(file, 'utf8');
    test(xml, dmnTable, params);
} catch (err) {
    console.error('error reading file at path: ', file, 'err: ', err);
}

// test parser and evaluater
async function test(xml: string, dmnTable: string, params: Object) {
    try {
        const parsedDecisionTable = await parseDmnXml(xml)
        const result = evaluateDecision(dmnTable, parsedDecisionTable, params);
        console.log('result: ', result);
    } catch (err) {
        console.error('error: ', err);
    }

}
```

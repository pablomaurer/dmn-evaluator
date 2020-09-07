import { evaluateDecision, parseDmnXml } from '../../dist';
import { readFileSync } from 'fs';

// prepare input
const params = {
  age: 29,
  gender: 'm',
  hasGrandchildren: false,
};
const file = '../data/rules.dmn';
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
        // console.dir(parsedDecisionTable, { depth: 5 });
        const result = evaluateDecision(dmnTable, parsedDecisionTable, params);
        console.log('dmn result: ', result);
    } catch (err) {
        console.error('error testing dmn lib: ', err);
    }

}



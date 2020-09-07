import DmnModdle from 'dmn-moddle';
import { unaryTest } from 'feelin';

// convert label to input variable: My Label -> myLabel
function mapLabelToInputVarName(label: string): string {
    let inputVar = label.charAt(0).toLowerCase() + label.slice(1);
    return inputVar.replace(/\s/g, "");
}

function isDate(input: any): boolean {
    return input instanceof Date || Object.prototype.toString.call(input) === '[object Date]';
}

function readDmnXml(xml: string, opts: any, callback: any) {
    return new DmnModdle().fromXML(xml, 'dmn:Definitions', opts, callback);
}

function parseRule(rule, idx) {
    const parsedRule = { number: idx + 1, inputValues: [], outputValues: [] };
    if (rule.inputEntry) {
        rule.inputEntry.forEach((inputEntry) => {
            let text = inputEntry.text;
            if (text === '') {
                text = '-';
            }
            // todo mapped to string because could not get boolean to working
            if (text === 'true') {
                text = '"true"'
            }
            if (text === 'false') {
                text = '"false"'
            }
            parsedRule.inputValues.push(text);
        });
    }
    rule.outputEntry.forEach((outputEntry) => {
        if (!outputEntry.text) {
            parsedRule.outputValues.push(null);
        } else {
            parsedRule.outputValues.push(JSON.parse(outputEntry.text));
        }
    });
    return parsedRule;
}

function parseDecisionTable(decisionId, decisionTable) {
    if (
        decisionTable.hitPolicy !== 'FIRST' &&
        decisionTable.hitPolicy !== 'UNIQUE' &&
        decisionTable.hitPolicy !== 'COLLECT' &&
        decisionTable.hitPolicy !== 'RULE ORDER'
    ) {
        throw new Error(`Unsupported hit policy ${decisionTable.hitPolicy}`);
    }
    const parsedDecisionTable = {
        hitPolicy: decisionTable.hitPolicy,
        rules: [],
        inputExpressions: [],
        outputNames: [],
    };

    // parse rules (there may be none, though)
    if (decisionTable.rule === undefined) {
        console.warn(`The decision table for decision '${decisionId}' contains no rules.`);
    } else {
        decisionTable.rule.forEach((rule, idx) => {
            parsedDecisionTable.rules.push(parseRule(rule, idx));
        });
    }

    // parse input expressions
    if (decisionTable.input) {
        decisionTable.input.forEach((input) => {
            let inputExpression;
            if (input.inputExpression && input.inputExpression.text) {
                inputExpression = input.inputExpression.text;
                // todo maybe breaks it? because i only have input.label and not input.inputVariable
                // } else if (input.inputVariable) {
                //   inputExpression = input.inputVariable;
            } else if (input.label) {
                inputExpression = input.label;
            } else {
                throw new Error(`No input variable or expression set for input '${input.id}'`);
            }
            parsedDecisionTable.inputExpressions.push(inputExpression);
        });
    }

    // parse output names
    decisionTable.output.forEach((output) => {
        if (output.name) {
            parsedDecisionTable.outputNames.push(output.name);
        } else {
            throw new Error(`No name set for output "${output.id}"`);
        }
    });
    return parsedDecisionTable;
}

function parseDecisions(drgElements) {
    const parsedDecisions = [];
    // iterate over all decisions in the DMN
    drgElements.forEach((drgElement) => {
        if (drgElement.decisionLogic) {
            // parse the decision table...
            const decision = {
                decisionTable: parseDecisionTable(drgElement.id, drgElement.decisionLogic),
                requiredDecisions: [],
            };
            // ...and collect the decisions on which the current decision depends
            if (drgElement.informationRequirement !== undefined) {
                drgElement.informationRequirement.forEach((req) => {
                    if (req.requiredDecision !== undefined) {
                        const requiredDecisionId = req.requiredDecision.href.replace('#', '');
                        decision.requiredDecisions.push(requiredDecisionId);
                    }
                });
            }
            parsedDecisions[drgElement.id] = decision;
        }
    });
    return parsedDecisions;
}

export function parseDmnXml(xml, opts = null) {
    return new Promise((resolve, reject) => {
        readDmnXml(xml, opts, (err, dmnContent) => {
            if (err) {
                reject(err);
            } else {
                try {
                    // console.dir(dmnContent.drgElement[0].decisionLogic, { depth: 4 });
                    const decisions = parseDecisions(dmnContent.drgElement);
                    resolve(decisions);
                } catch (err) {
                    reject(err);
                }
            }
        });
    });
}

function resolveExpression(expression, obj) {
    const parts = expression.split('.');
    return parts.reduce((resolved, part) => (resolved === undefined ? undefined : resolved[part]), obj);
}

// Sets the given value to a nested property of the given object. The nested property is resolved from the given expression.
// If the given nested property does not exist, it is added. If it exists, it is set (overwritten). If it exists and is
// an array, the given value is added.
// Examples:
//   setOrAddValue('foo.bar', { }, 10) returns { foo: { bar: 10 } }
//   setOrAddValue('foo.bar', { foo: { }, 10) returns { foo: { bar: 10 } }
//   setOrAddValue('foo.bar', { foo: { bar: 9 }, 10) returns { foo: { bar: 10 } }
//   setOrAddValue('foo.bar', { foo: { bar: [ ] }, 10) returns { foo: { bar: [ 10 ] } }
//   setOrAddValue('foo.bar', { foo: { bar: [ 9 ] }, 10) returns { foo: { bar: [9, 10 ] } }
function setOrAddValue(expression, obj, value) {
    const indexOfDot = expression.indexOf('.');
    if (indexOfDot < 0) {
        if (obj[expression] && Array.isArray(obj[expression])) {
            obj[expression].push(value); // eslint-disable-line no-param-reassign
        } else {
            obj[expression] = value; // eslint-disable-line no-param-reassign
        }
    } else {
        const first = expression.substr(0, indexOfDot);
        const remainder = expression.substr(indexOfDot + 1);
        if (obj[first]) {
            setOrAddValue(remainder, obj[first], value);
        } else {
            obj[first] = setOrAddValue(remainder, {}, value); // eslint-disable-line no-param-reassign
        }
    }
    return obj;
}

// merge the result of the required decision into the context so that it is available as input for the requested decision
function mergeContext(context, additionalContent, aggregate = false) {
    if (Array.isArray(additionalContent)) {
        // additional content is the result of evaluation a rule table with multiple rule results
        additionalContent.forEach((ruleResult) => mergeContext(context, ruleResult, true));
    } else {
        // additional content is the result of evaluation a rule table with a single rule result
        for (const prop in additionalContent) {
            // eslint-disable-line no-restricted-syntax
            if (additionalContent.hasOwnProperty(prop)) {
                const value = additionalContent[prop];
                if (Array.isArray(context[prop])) {
                    if (Array.isArray(value)) {
                        context[prop] = context[prop].concat(value); // eslint-disable-line no-param-reassign
                    } else if (value !== null && value !== undefined) {
                        context[prop].push(value); // eslint-disable-line no-param-reassign
                    }
                } else if (typeof value === 'object' && value !== null && !isDate(value)) {
                    if (context[prop] === undefined || context[prop] === null) {
                        context[prop] = {}; // eslint-disable-line no-param-reassign
                    }
                    mergeContext(context[prop], value, aggregate);
                } else if (aggregate) {
                    context[prop] = []; // eslint-disable-line no-param-reassign
                    context[prop].push(value); // eslint-disable-line no-param-reassign
                } else {
                    context[prop] = value; // eslint-disable-line no-param-reassign
                }
            }
        }
    }
}

function evaluateRule(rule, resolvedInputExpressions, outputNames) {
    // console.log('.........................');
    // console.log(rule)
    for (let i = 0; i < rule.inputValues.length; i += 1) {
        try {
            let inputValue = resolvedInputExpressions[i].value;
            if (inputValue === true) {
                inputValue = 'true'
            }
            if (inputValue === false) {
                inputValue = 'false'
            }
            const inputRule = rule.inputValues[i];
            const res = unaryTest(inputRule, { '?': inputValue })
            // console.log('inputRule: ', inputRule, 'inputname: ', resolvedInputExpressions[i].name, 'inputValue: ', inputValue, 'res: ', res);
            if (!res) {
                return {
                    matched: false,
                };
            }
        } catch (err) {
            console.error(err);
            throw new Error(`Failed to evaluate input condition in column ${i + 1}: '${rule.inputValues[i]}': ${err}`);
        }
    }
    const outputObject = {};
    for (let i = 0; i < rule.outputValues.length; i += 1) {
        if (rule.outputValues[i] !== null) {
            setOrAddValue(outputNames[i], outputObject, rule.outputValues[i]);
        } else {
            setOrAddValue(outputNames[i], outputObject, undefined);
        }
    }
    // console.log('outputObject', { matched: true, output: outputObject });
    return { matched: true, output: outputObject };
}

export function evaluateDecision(decisionId, decisions, context, alreadyEvaluatedDecisions = null) {
    if (!alreadyEvaluatedDecisions) {
        alreadyEvaluatedDecisions = []; // eslint-disable-line no-param-reassign
    }
    const decision = decisions[decisionId];
    if (decision === undefined) {
        throw new Error(`No such decision "${decisionId}"`);
    }

    // execute required decisions recursively first
    for (let i = 0; i < decision.requiredDecisions.length; i += 1) {
        const reqDecision = decision.requiredDecisions[i];
        // check if the decision was already executed, to prevent unecessary evaluations if multiple decisions require the same decision
        if (!alreadyEvaluatedDecisions[reqDecision]) {
            console.debug(`Need to evaluate required decision ${reqDecision}`);
            const requiredResult = evaluateDecision(reqDecision, decisions, context, alreadyEvaluatedDecisions); // eslint-disable-line no-await-in-loop
            mergeContext(context, requiredResult);
            alreadyEvaluatedDecisions[reqDecision] = true; // eslint-disable-line no-param-reassign
        }
    }
    // console.info(`Evaluating decision "${decisionId}"...`);
    const decisionTable = decision.decisionTable;

    // resolve input expressions
    const resolvedInputExpressions = [];
    for (let i = 0; i < decisionTable.inputExpressions.length; i += 1) {
        try {
            // check if the input expression is to be treated as an input variable - this is the case if it is a qualified name
            // todo just treated all inputExpressions as input variables
            // fix label to input variable name
            const inputVarName = mapLabelToInputVarName(decisionTable.inputExpressions[i])
            resolvedInputExpressions.push({
                value: context[inputVarName],
                name: inputVarName,
            });
        } catch (err) {
            throw new Error(`Failed to evaluate input expression of decision ${decisionId}: ${err}`);
        }
    }
    //console.log(resolvedInputExpressions);

    // initialize the result to an object with undefined output values (hit policy FIRST or UNIQUE) or to an empty array (hit policy COLLECT or RULE ORDER)
    const decisionResult: any = decisionTable.hitPolicy === 'FIRST' || decisionTable.hitPolicy === 'UNIQUE' ? {} : [];
    decisionTable.outputNames.forEach((outputName) => {
        if (decisionTable.hitPolicy === 'FIRST' || decisionTable.hitPolicy === 'UNIQUE') {
            setOrAddValue(outputName, decisionResult, undefined);
        }
    });

    // iterate over the rules of the decision table of the requested decision,
    // and either return the output of the first matching rule (hit policy FIRST)
    // or collect the output of all matching rules (hit policy COLLECT)
    let hasMatch = false;
    for (let i = 0; i < decisionTable.rules.length; i += 1) {
        const rule = decisionTable.rules[i];
        let ruleResult;
        try {
            ruleResult = evaluateRule(rule, resolvedInputExpressions, decisionTable.outputNames); // eslint-disable-line no-await-in-loop
        } catch (err) {
            throw new Error(`Failed to evaluate rule ${rule.number} of decision ${decisionId}:  ${err}`);
        }
        if (ruleResult.matched) {
            // only one match for hit policy UNIQUE!
            if (hasMatch && decisionTable.hitPolicy === 'UNIQUE') {
                throw new Error(`Decision "${decisionId}" is not unique but hit policy is UNIQUE.`);
            }
            hasMatch = true;
            // console.info(`Result for decision "${decisionId}": ${JSON.stringify(ruleResult.output)} (rule ${i + 1} matched)`);

            // merge the result of the matched rule
            if (decisionTable.hitPolicy === 'FIRST' || decisionTable.hitPolicy === 'UNIQUE') {
                decisionTable.outputNames.forEach((outputName) => {
                    const resolvedOutput = resolveExpression(outputName, ruleResult.output);
                    if (
                        resolvedOutput !== undefined ||
                        decisionTable.hitPolicy === 'FIRST' ||
                        decisionTable.hitPolicy === 'UNIQUE'
                    ) {
                        setOrAddValue(outputName, decisionResult, resolvedOutput);
                    }
                });
                if (decisionTable.hitPolicy === 'FIRST') {
                    // no more rule results in this case
                    break;
                }
            } else {
                decisionResult.push(ruleResult.output);
            }
        }
    }
    if (!hasMatch && decisionTable.rules.length > 0) {
        console.warn(`No rule matched for decision "${decisionId}".`);
    }
    return decisionResult;
}

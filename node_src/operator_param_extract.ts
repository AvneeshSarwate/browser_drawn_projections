import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';

// Constants
const XML_HARMONICS_COUNT = 64;
const FAUST_HARMONICS_COUNT = 16;

const ABLETON_OPERATOR_PATH = [
    'Ableton',
    'LiveSet',
    'Tracks',
    'MidiTrack',
    'DeviceChain',
    'DeviceChain',
    'Operator'
] as const;

// Interfaces for XML structure
interface Manual {
    '@_Value': string | number;
}

interface EnvelopeParam {
    Manual: Manual;
}

interface Envelope {
    AttackTime: EnvelopeParam;
    DecayTime: EnvelopeParam;
    SustainLevel: EnvelopeParam;
    ReleaseTime: EnvelopeParam;
}

interface Tune {
    Coarse: EnvelopeParam;
    Fine: EnvelopeParam;
}

interface Volume {
    Manual: Manual;
}

interface HarmonicValue {
    '@_Value': string | number;
}

interface UserHarmonics {
    [key: `Harmonics.${number}`]: HarmonicValue;
    NumHarmonics: { '@_Value': string | number };
    ExpansionMode: { '@_Value': string | number };
    Normalize: { '@_Value': string | number };
}

interface Operator {
    Envelope: Envelope;
    Tune: Tune;
    Volume: Volume;
    UserHarmonics: UserHarmonics;
}

// Interfaces for parsed data
interface EnvelopeData {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
}

interface TuneData {
    coarse: number;
    fine: number;
}

interface ParsedOperator {
    envelope: EnvelopeData;
    tune: TuneData;
    volume: number;
    harmonics: number[];
}

interface FaustMapping {
    [key: string]: number;
}

function fastTraverse(obj: any): Operator[] {
    const operators: (Operator | undefined)[] = [];
    
    try {
        let current = obj;
        for (const pathElement of ABLETON_OPERATOR_PATH) {
            current = current[pathElement];
            
            if (!current) {
                throw new Error(`Path element ${pathElement} not found`);
            }
        }

        for (let i = 0; i < 4; i++) {
            const operatorKey = `Operator.${i}`;
            if (current[operatorKey]) {
                operators[i] = current[operatorKey] as Operator;
            }
        }
    } catch (error) {
        console.error('Error in fast traversal:', error instanceof Error ? error.message : 'Unknown error');
        return [];
    }
    
    return operators.filter((op): op is Operator => op !== undefined);
}

function fullTraverse(obj: any): Operator[] {
    const operators: (Operator | undefined)[] = [];
    
    function traverse(current: any): void {
        if (!current || typeof current !== 'object') return;
        
        for (let i = 0; i < 4; i++) {
            const operatorKey = `Operator.${i}`;
            if (current[operatorKey]) {
                operators[i] = current[operatorKey] as Operator;
            }
        }
        
        for (const key in current) {
            traverse(current[key]);
        }
    }
    
    traverse(obj);
    return operators.filter((op): op is Operator => op !== undefined);
}

function parseOperatorData(operator: Operator): ParsedOperator {
    const envelope: EnvelopeData = {
        attack: Number(operator.Envelope.AttackTime.Manual['@_Value']),
        decay: Number(operator.Envelope.DecayTime.Manual['@_Value']),
        sustain: Number(operator.Envelope.SustainLevel.Manual['@_Value']),
        release: Number(operator.Envelope.ReleaseTime.Manual['@_Value'])
    };

    const tune: TuneData = {
        coarse: Number(operator.Tune.Coarse.Manual['@_Value']),
        fine: Number(operator.Tune.Fine.Manual['@_Value'])
    };

    const volume = Number(operator.Volume.Manual['@_Value']);

    // Extract harmonics
    const harmonicsArray: number[] = [];
    
    // Count actual harmonics (excluding other properties like NumHarmonics)
    const harmonicsKeys = Object.keys(operator.UserHarmonics)
        .filter(key => key.startsWith('Harmonics.') && key !== 'Harmonics.Count');
        
    if (harmonicsKeys.length !== XML_HARMONICS_COUNT) {
        console.warn('Warning: XML does not contain expected number of harmonics');
    }

    // Extract only the harmonics we need for Faust
    for (let i = 0; i < FAUST_HARMONICS_COUNT; i++) {
        const value = Number(operator.UserHarmonics[`Harmonics.${i}`]['@_Value']);
        harmonicsArray.push(value);
    }

    return {
        envelope,
        tune,
        volume,
        harmonics: harmonicsArray
    };
}

function createFaustMapping(operators: ParsedOperator[]): FaustMapping {
    const mapping: FaustMapping = {};

    operators.forEach((operator, index) => {
        const voiceNum = index + 1;
        const prefix = `/oscillator/Voice_${voiceNum}`;

        // Map envelope parameters
        mapping[`${prefix}/xAttack`] = operator.envelope.attack;
        mapping[`${prefix}/xDecay`] = operator.envelope.decay;
        mapping[`${prefix}/xSustain`] = operator.envelope.sustain;
        mapping[`${prefix}/xRelease`] = operator.envelope.release;

        // Map tuning parameters
        mapping[`${prefix}/yCoarse`] = operator.tune.coarse;
        mapping[`${prefix}/yFine`] = operator.tune.fine;
        mapping[`${prefix}/yOp_${voiceNum}_Mod_Depth`] = operator.volume;

        // Map harmonics
        operator.harmonics.forEach((value, i) => {
            mapping[`${prefix}/zHarmonics_${voiceNum}/h_${i}`] = value;
        });
    });

    // Add global parameters
    mapping['/oscillator/AGate'] = 0;
    mapping['/oscillator/AMidiNote'] = 60;
    mapping['/oscillator/AOn_hold'] = 0;

    return mapping;
}

function parseXMLFile(filePath: string, useFastTraverse = false): void {
    console.time('XML Processing');
    
    try {
        const xmlData = fs.readFileSync(filePath, 'utf8');
        
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            parseAttributeValue: true
        });
        
        const result = parser.parse(xmlData);

        const findOperators = useFastTraverse ? fastTraverse : fullTraverse;
        console.log(`Using ${useFastTraverse ? 'fast' : 'full'} traversal method`);

        const foundOperators = findOperators(result);
        
        if (foundOperators.length === 0) {
            console.error('No operators found in the XML file');
            console.timeEnd('XML Processing');
            return;
        }

        console.log(`Found ${foundOperators.length} operators`);

        const parsedOperators = foundOperators.map(parseOperatorData);
        const faustMapping = createFaustMapping(parsedOperators);
        
        fs.writeFileSync('faust_params.json', JSON.stringify(faustMapping, null, 2));
        console.log('Successfully created faust_params.json');
        console.timeEnd('XML Processing');

    } catch (error) {
        console.error('Error processing XML file:', error instanceof Error ? error.message : 'Unknown error');
        console.timeEnd('XML Processing');
    }
}

// Usage examples:
// parseXMLFile('path_to_your_xml_file.xml');       // Use full traversal (default)
// parseXMLFile('path_to_your_xml_file.xml', true); // Use fast traversal

//get the path to the xml file from the command line
const filePath = process.argv[2];
parseXMLFile(filePath);

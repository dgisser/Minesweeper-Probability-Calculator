import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const probabilityEngineSource = readFileSync(new URL('../../probability-engine.js', import.meta.url), 'utf8');
const gameSource = readFileSync(new URL('../../index.js', import.meta.url), 'utf8');

class ElementStub {
    constructor(tagName = 'div') {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.checked = false;
        this.className = '';
        this.id = '';
        this.innerHTML = '';
        this.style = {};
        this.textContent = '';
        this.value = '';
    }

    addEventListener() {}

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    setAttribute(name, value) {
        this[name] = value;
    }
}

function createDocument() {
    const elements = new Map();

    function getElementById(id) {
        if (!elements.has(id)) {
            const element = new ElementStub();
            element.id = id;
            elements.set(id, element);
        }
        return elements.get(id);
    }

    const defaults = {
        body: {},
        flagMode: { checked: false },
        minutes: { innerHTML: '00' },
        minesRemaining: {},
        nonEdgeProbability: { checked: false },
        numColumns: { value: '30' },
        numMines: { value: '99' },
        numRows: { value: '16' },
        seconds: { innerHTML: '00' },
        timerBlock: {},
    };

    for (const [id, values] of Object.entries(defaults)) {
        Object.assign(getElementById(id), values);
    }

    return {
        createElement: (tagName) => new ElementStub(tagName),
        getElementById,
    };
}

export function loadGame() {
    const alerts = [];
    const document = createDocument();
    const context = vm.createContext({
        alert: (message) => alerts.push(message),
        clearInterval: () => {},
        console,
        document,
        setInterval: () => 1,
        setTimeout: (callback) => callback(),
    });

    vm.runInContext(probabilityEngineSource, context, { filename: 'probability-engine.js' });
    vm.runInContext(gameSource, context, { filename: 'index.js' });

    return {
        alerts,
        document,
        evaluate(expression, { timeoutMs } = {}) {
            return vm.runInContext(
                expression,
                context,
                timeoutMs === undefined ? undefined : { timeout: timeoutMs },
            );
        },
        evaluateJson(expression) {
            return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
        },
    };
}

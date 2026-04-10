const proc = require('child_process');

const root = '../../..'
const dataFile = process.argv[2]
let data = require(`./${root}/${dataFile}`)

// Group results by graph size
const bucketSize = 100
const elkByGraphSize = groupBy(data.results, (e) => Math.floor(e.nodeEdgeCount / bucketSize))

// Ensure all buckets exist before using array indices to denote buckets
const maxKey = Object.keys(elkByGraphSize).reduce((r, e) => Math.max(r, e))
for (let i = 0; i < maxKey; i++) {
    if (!elkByGraphSize[i])
        elkByGraphSize[i] = []
}


// - - - Cmdline - - -

const differences = data.results.map((r) => r.elkjs - r.elk)
const relatives = data.results.map((r) => r.elkjs / r.elk)
const bucketRelatives = Object.keys(elkByGraphSize).map((k) => {
    return elkByGraphSize[k].map((r) => r.elkjs / r.elk)
})
console.log("Some results to look at: ")
console.log(" (elkjs vs elk, thus positive or values larger than 1.0 indicate a slower elkjs)")
let results = {
    'Absolute [ms]': getAvgMinMax(differences),
    'Relative': getAvgMinMax(relatives),
    '': {}, // empty line for readability
}
bucketRelatives.forEach((bucket, i) =>
    results[`Relative [${i * 100}, ${(i + 1) * 100 - 1}]`] = getAvgMinMax(bucket)
)
console.table(results)


// - - - Plots - - -

console.log("Generating boxplots ...")

const title = Object.keys(data.versions).map((k) => `${k}: ${data.versions[k]}`).join(", ")
const yLabels = ["All", ""].concat(Object.keys(elkByGraphSize).map((_, i) => `[${i * 100}, ${(i + 1) * 100 - 1}]`))

// For the first two plots we want a common y-axis to improve comparability
const elkAbsolute = data.results.map((r) => r.elk)
const elkjsAbsolute = data.results.map((r) => r.elkjs)
const maxExecutionTime = elkAbsolute.concat(elkjsAbsolute).reduce((a, b) => Math.max(a, b), Number.MIN_SAFE_INTEGER)
const yLim = Math.ceil(maxExecutionTime / 100) * 100;
const hasWasmResults = data.results.some((r) => typeof r.elkWasmGc === 'number')

// I couldn't find anything simple and quick (without looking for too long) 
// to render boxplots in node, hence, resort to a small py script.
const pyEval = './src/main/py/eval.py'
// ELK absolute
{
    const bucketElkAbsolute = Object.keys(elkByGraphSize).map((k) => {
        return elkByGraphSize[k].map((r) => r.elk)
    })
    const out = proc.spawnSync('python', [pyEval,
        'Graph Elements (nodes + edges)',
        'elk [ms]',
        title,
        JSON.stringify([elkAbsolute, []].concat(bucketElkAbsolute)),
        JSON.stringify(yLabels),
        `${dataFile.replace(/\.json/, '')}-elk-bp.svg`,
        yLim,
    ])
    if (out.stderr && out.stderr.length > 0)
        console.log(out.stderr.toString())
}

// elkjs absolute
{
    const bucketElkjsAbsolute = Object.keys(elkByGraphSize).map((k) => {
        return elkByGraphSize[k].map((r) => r.elkjs)
    })
    const out = proc.spawnSync('python', [pyEval,
        'Graph Elements (nodes + edges)',
        'elkjs [ms]',
        title,
        JSON.stringify([elkjsAbsolute, []].concat(bucketElkjsAbsolute)),
        JSON.stringify(yLabels),
        `${dataFile.replace(/\.json/, '')}-elkjs-bp.svg`,
        yLim,
    ])
    if (out.stderr && out.stderr.length > 0)
        console.log(out.stderr.toString())
}

// ELK vs elkjs relative
{
    const bucketRelatives = Object.keys(elkByGraphSize).map((k) => {
        return elkByGraphSize[k].map((r) => r.elkjs / r.elk)
    })
    const out = proc.spawnSync('python', [pyEval,
        'Graph Elements (nodes + edges)',
        'elkjs / elk',
        title,
        JSON.stringify([relatives, []].concat(bucketRelatives)),
        JSON.stringify(yLabels),
        `${dataFile.replace(/\.json/, '')}-cmp-bp-relative.svg`,
        'auto',
    ])
    if (out.stderr && out.stderr.length > 0)
        console.log(out.stderr.toString())
}

// ELK vs elkjs absolute
{
    const bucketAbsolute = Object.keys(elkByGraphSize).map((k) => {
        return elkByGraphSize[k].map((r) => r.elkjs - r.elk)
    })
    const out = proc.spawnSync('python', [pyEval,
        'Graph Elements (nodes + edges)',
        'elkjs - elk [ms]',
        title,
        JSON.stringify([differences, []].concat(bucketAbsolute)),
        JSON.stringify(yLabels),
        `${dataFile.replace(/\.json/, '')}-cmp-bp-absolute.svg`,
        'auto',
    ])
    if (out.stderr && out.stderr.length > 0)
        console.log(out.stderr.toString())
}

// elkjs-gwt vs elkjs-wasm relative
if (hasWasmResults) {
    const bucketRelatives = Object.keys(elkByGraphSize).map((k) => {
        return elkByGraphSize[k].map((r) => r.elkjs / r.elkWasmGc)
    })
    const wasmRelatives = data.results.map((r) => r.elkjs / r.elkWasmGc)
    const out = proc.spawnSync('python', [pyEval,
        'Graph Elements (nodes + edges)',
        'elkjs-gwt / elkjs-wasm',
        title,
        JSON.stringify([wasmRelatives, []].concat(bucketRelatives)),
        JSON.stringify(yLabels),
        `${dataFile.replace(/\.json/, '')}-cmp-gwt-wasm-bp-relative.svg`,
        'auto',
    ])
    if (out.stderr && out.stderr.length > 0)
        console.log(out.stderr.toString())
}

// Grouped absolute execution times
{
    const groupedSeries = [
        {
            label: 'elk',
            color: '#4e79a7',
            values: [elkAbsolute, []].concat(Object.keys(elkByGraphSize).map((k) => elkByGraphSize[k].map((r) => r.elk))),
        },
        {
            label: 'elkjs-gwt',
            color: '#f28e2b',
            values: [elkjsAbsolute, []].concat(Object.keys(elkByGraphSize).map((k) => elkByGraphSize[k].map((r) => r.elkjs))),
        },
    ]
    if (hasWasmResults) {
        groupedSeries.push({
            label: 'elkjs-wasm',
            color: '#59a14f',
            values: [data.results.map((r) => r.elkWasmGc), []].concat(
                Object.keys(elkByGraphSize).map((k) => elkByGraphSize[k]
                    .filter((r) => typeof r.elkWasmGc === 'number')
                    .map((r) => r.elkWasmGc))
            ),
        })
    }
    const out = proc.spawnSync('python', [pyEval,
        'Graph Elements (nodes + edges)',
        'Execution time [ms]',
        title,
        JSON.stringify(groupedSeries),
        JSON.stringify(yLabels),
        `${dataFile.replace(/\.json/, '')}-grouped-bp.svg`,
        yLim,
        'grouped',
    ])
    if (out.stderr && out.stderr.length > 0)
        console.log(out.stderr.toString())
}

console.log("Done.")

// Utility

function groupBy(collection, keyFun) {
    return collection.reduce((g, e) => {
        (g[keyFun(e)] = g[keyFun(e)] || []).push(e)
        return g;
    }, {})
}

function getAvgMinMax(collection) {
    if (collection.length === 0) {
        return {
            'Avg': '-',
            'Min': '-',
            'Max': '-',
            'Count': 0,
        }
    }
    const min = collection.reduce((a, b) => Math.min(a, b), Number.MAX_SAFE_INTEGER)
    const max = collection.reduce((a, b) => Math.max(a, b), Number.MIN_SAFE_INTEGER)
    const avg = collection.reduce((a, b) => a + b, 0) / collection.length
    const out = {
        'Avg': avg.toFixed(2),
        'Min': min.toFixed(2),
        'Max': max.toFixed(2),
        'Count': collection.length,
    }
    return out
}

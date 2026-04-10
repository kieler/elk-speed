const dateFormat = require('dateformat')
const fs = require('fs')
const glob = require('glob')
const path = require('path')
const proc = require('child_process')
const si = require('systeminformation')
const { pathToFileURL } = require('url')

const ELK_VERSION = '0.11.0'

async function main() {
    const elkSpeedRoot = path.resolve(__dirname, '../../..')
    const graphPattern = process.argv[2]
    if (!graphPattern) {
        throw new Error('Missing graph glob. Usage: node src/main/js/speed.js "<glob>" [k]')
    }

    const k = process.argv[3] ? parseInt(process.argv[3], 10) : 10
    const elkjsSource = resolveElkjsSource(elkSpeedRoot)
    const elk = elkjsSource.createElk()
    const elkWasm = elkjsSource.createWasm ? await elkjsSource.createWasm() : null
    const graphs = glob.sync(graphPattern)

    const javaVersionOut = proc.spawnSync('java', ['-version'])
    const javaVersion = javaVersionOut.stderr.toString().match(/\"(.*)\"/)[1]
    const versions = {
        elk: ELK_VERSION,
        [elkjsSource.gwtName]: elkjsSource.version,
        java: javaVersion,
        node: process.version,
    }
    if (elkWasm) {
        versions[elkjsSource.wasmName] = elkjsSource.version
    }

    const system_info = (({ brand, manufacturer, speed }, { total }) =>
        ({
            cpu_brand: brand,
            cpu_manufacturer: manufacturer,
            cpu_speed: speed,
            memory_total: (total / 1024 ** 3).toFixed(1) + ' GB'
        })
    )(await si.cpu(), await si.mem())
    const time = new Date().toISOString()

    let results = []

    for (let i = 0; i < graphs.length; i++) {
        console.log()
        const graphPath = graphs[i]
        console.log(`${i + 1} of ${graphs.length}: ${graphPath}`)
        const graphText = fs.readFileSync(path.resolve(elkSpeedRoot, graphPath), 'utf8')
        const graph = JSON.parse(graphText)

        const elkjsBest = await measureBestOfK(k, () => elk.layout(JSON.parse(graphText)))
        console.log('elkjs ' + elkjsBest.best + 'ms')

        let elkWasmBest = null
        if (elkWasm) {
            elkWasmBest = await measureBestOfK(k, () => elkWasm.layout(JSON.parse(graphText)))
            console.log('elkWasmGc ' + elkWasmBest.best + 'ms')
        }

        const javaBest = measureJavaBestOfK(graphPath, k, elkSpeedRoot)
        console.log('java ' + javaBest.best + 'ms')

        const result = {
            path: graphPath,
            nodeEdgeCount: countNodesAndEdges(graph),
            elk: javaBest.best,
            elkjs: elkjsBest.best,
        }
        if (elkWasmBest) {
            result.elkWasmGc = elkWasmBest.best
        }

        const errors = {}
        if (elkjsBest.error) {
            errors.elkjs = elkjsBest.error
        }
        if (elkWasmBest && elkWasmBest.error) {
            errors.elkWasmGc = elkWasmBest.error
        }
        if (javaBest.error) {
            errors.elk = javaBest.error
        }
        if (Object.keys(errors).length > 0) {
            result.errors = errors
        }

        results.push(result)
    }

    terminateIfPossible(elk)
    terminateIfPossible(elkWasm)

    const content = JSON.stringify({
        time: time,
        versions: versions,
        kbest: k,
        system_info: system_info,
        results: results,
    }, null, ' ')

    fs.writeFileSync(`./results/result-${dateFormat(Date.now(), 'yyyymmddHHMM')}.json`, content)
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error))
    process.exitCode = 1
})

function resolveElkjsSource(elkSpeedRoot) {
    const localRoot = process.env.ELKJS_LOCAL_ROOT
        ? path.resolve(elkSpeedRoot, process.env.ELKJS_LOCAL_ROOT)
        : null

    if (localRoot) {
        const packageJsonPath = path.join(localRoot, 'package.json')
        const mainEntryPath = path.join(localRoot, 'lib/main.js')
        const wasmEntryPath = path.join(localRoot, 'lib/wasm-node.mjs')

        ensureFile(packageJsonPath, `ELKJS_LOCAL_ROOT points to '${localRoot}', but package.json is missing.`)
        ensureFile(mainEntryPath, `Build the local elkjs checkout in '${localRoot}' first.`)
        ensureFile(wasmEntryPath, `Build the local elkjs wasm artifacts in '${localRoot}' first.`)

        return {
            version: JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version,
            gwtName: 'elkjs-gwt-local',
            wasmName: 'elkjs-wasm-local',
            createElk: function () {
                const ELK = require(mainEntryPath)
                return new ELK()
            },
            createWasm: async function () {
                const createELK = (await import(pathToFileURL(wasmEntryPath).href)).createELK
                return await createELK()
            },
        }
    }

    return {
        version: require('elkjs/package.json').version,
        gwtName: 'elkjs-gwt',
        wasmName: 'elkjs-wasm',
        createElk: function () {
            const ELK = require('elkjs')
            return new ELK()
        },
        createWasm: null,
    }
}

function ensureFile(filePath, hint) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing required file: ${filePath}. ${hint}`)
    }
}

async function measureBestOfK(k, operation) {
    let best = Number.MAX_SAFE_INTEGER
    for (let i = 0; i < k; i++) {
        try {
            const start = Date.now()
            await operation()
            best = Math.min(best, Date.now() - start)
        } catch (error) {
            return {
                best: -1,
                error: String(error && error.message ? error.message : error),
            }
        }
    }
    return { best }
}

function measureJavaBestOfK(graphPath, k, elkSpeedRoot) {
    const child = proc.spawnSync(
        'java', ['-jar', './build/libs/elk-speed-all.jar', graphPath, String(k)],
        { cwd: elkSpeedRoot }
    )
    if (child.status === 0 && child.stderr.length === 0 && child.stdout.length > 0) {
        return {
            best: parseInt(child.stdout.toString().trim(), 10),
        }
    }
    return {
        best: -1,
        error: child.stderr.toString() || child.stdout.toString(),
    }
}

function terminateIfPossible(elk) {
    if (elk && typeof elk.terminateWorker === 'function') {
        try {
            elk.terminateWorker()
        } catch (error) {
            if (!/terminate is not a function/.test(String(error && error.message ? error.message : error))) {
                throw error
            }
        }
    }
}

function countNodesAndEdges(graph) {
    let count = 1
    if (graph.children) {
        graph.children.forEach((c) => count += countNodesAndEdges(c))
    }
    if (graph.edges) {
        count += graph.edges.length
    }
    return count
}

(async function () {

    const dateFormat = require('dateformat');
    const fs = require('fs')
    const glob = require("glob")
    const proc = require('child_process')
    const si = require('systeminformation');

    const root = '../../..'
    const ELK = require(`${root}/node_modules/elkjs/lib/main.js`)
    const elk = new ELK()
    const graphs = glob.sync(process.argv[2])

    const javaVersionOut = proc.spawnSync('java', ['-version'])
    const javaVersion = javaVersionOut.stderr.toString().match(/\"(.*)\"/)[1]
    const versions = {
        elk: '0.7.0-SNAPSHOT',
        elkjs: '0.7.0-SNAPSHOT',
        java: javaVersion,
        node: process.version,
    }

    const k = 10;
    const system_info = (({ brand, manufacturer, speed }, { total }) =>
        ({
            cpu_brand: brand,
            cpu_manufacturer: manufacturer,
            cpu_speed: speed,
            memory_total: (total / 1024 ** 3).toFixed(1) + " GB"
        })
    )(await si.cpu(), await si.mem())
    const time = new Date().toISOString()

    let results = []

    for (var i = 0; i < graphs.length; i++) {
        console.log()
        const graphPath = graphs[i];
        console.log(`${i + 1} of ${graphs.length}: ${graphPath}`)
        const graph = require(`${root}/${graphPath}`)

        // --- elkjs ---
        let best = Number.MAX_SAFE_INTEGER;
        for (var t = 0; t < k; t++) {
            const start = Date.now();
            const ms = await elk.layout(graph)
                .then(function () {
                    return Date.now() - start;
                })
                .catch(() => best = -1)
            best = Math.min(best, ms)
        }
        console.log("elkjs " + best + "ms")

        // --- elk ---
        const child = proc.spawnSync(
            'java', ['-jar', './build/libs/elk-speed-all.jar', graphPath, k]
        );
        let javaBest = -1
        if (child.stderr.length == 0 && child.stdout.length > 0) {
            javaBest = parseInt(child.stdout.toString())
        } else {
            console.log("Problem occurred:")
            console.log(child.output.toString())
        }
        console.log("java " + javaBest + "ms")

        results.push({
            path: graphPath,
            nodeEdgeCount: countNodesAndEdges(graph),
            elk: javaBest,
            elkjs: best,
        });
    }

    const content = JSON.stringify({
        time: time,
        versions: versions,
        kbest: k,
        system_info: system_info,
        results: results,
    }, null, " ")

    const dateString = dateFormat(Date.now(), "yyyymmddHHMM")
    fs.writeFileSync(`./results/result-${dateString}.json`, content)

})();

function countNodesAndEdges(graph) {
    let count = 1;
    if (graph.children) {
        graph.children.forEach((c) => count += countNodesAndEdges(c))
    }
    if (graph.edges) {
        count += graph.edges.length;
    }
    return count;
}

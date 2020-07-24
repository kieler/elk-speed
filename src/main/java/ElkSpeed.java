import java.io.File;
import java.nio.charset.Charset;

import org.eclipse.elk.alg.layered.options.LayeredMetaDataProvider;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.util.NullElkProgressMonitor;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.graph.json.ElkGraphJson;

import com.google.common.base.Joiner;
import com.google.common.io.Files;

class ElkSpeed {

    static {
    }

    public static void main(String[] args) {
        try {

            LayoutMetaDataService service = LayoutMetaDataService.getInstance();
            service.registerLayoutMetaDataProviders(new LayeredMetaDataProvider());
            
            final String graphPath = args[0];
            int kBest = 10; 
            if (args.length > 1) {
                kBest = Integer.valueOf(args[1]);
            }

            final String graph = Joiner.on("\n").join(Files.readLines(new File(graphPath), Charset.defaultCharset()));
            final ElkNode elkGraph = ElkGraphJson.forGraph(graph).toElk();

            final RecursiveGraphLayoutEngine engine = new RecursiveGraphLayoutEngine();

            int best = Integer.MAX_VALUE;

            for (int i = 0; i < kBest; ++i) {
                final long start = System.currentTimeMillis();
                engine.layout(elkGraph, new NullElkProgressMonitor());
                final long ms = System.currentTimeMillis() - start;

                best = Math.min(best, (int) ms);
            }
            
            System.out.println(best);
            return;
            
        } catch (Throwable t) {
            t.printStackTrace();
            // silent
        }
        System.err.println(-1);
    }

}

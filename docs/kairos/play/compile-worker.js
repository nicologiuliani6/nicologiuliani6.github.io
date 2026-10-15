// Kairos frontend (Python + PLY) running in Pyodide: source text -> bytecode.
importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js');

const ROOT = '/home/pyodide/kairos';

const COMPILE = `
import sys
sys.path.insert(0, ${JSON.stringify(ROOT)})
sys.setrecursionlimit(4000)

def compile_kairos(source):
    # The frontend keeps state in module globals: start from fresh modules.
    for name in [m for m in sys.modules if m == 'src' or m.startswith('src.')]:
        del sys.modules[name]
    from src.frontend.lexer import lexer
    from src.frontend.parser import parser, run_static_checks, desugar_try
    from src.frontend.bytecode import ByteCode_Compiler
    from src.frontend.errors import KairosCompileError
    try:
        ast = parser.parse(source, lexer=lexer)
        if ast is None:
            raise KairosCompileError("PARSER", "compilation stopped: no AST produced")
        ast = desugar_try(ast)
        run_static_checks(ast)
        bt = ByteCode_Compiler()
        bt.process(ast)
    except KairosCompileError as exc:
        return [False, str(exc)]
    except RecursionError:
        return [False, "[COMPILER] program too deeply nested for the browser playground"]
    except Exception as exc:
        return [False, f"[COMPILER] internal error: {exc}"]
    lines = []
    while not bt.queue.empty():
        _phys, src_tag, instr = bt.queue.get()
        lines.append(f"{src_tag:<6}  {instr}")
    return [True, "\\n".join(lines) + "\\n"]
`;

const ready = (async () => {
  const py = await loadPyodide();
  const list = (await (await fetch('py/files.txt')).text()).split('\n').filter(Boolean);
  await Promise.all(list.map(async (f) => {
    const r = await fetch('py/' + f);
    if (!r.ok) throw new Error(`could not load ${f} (HTTP ${r.status})`);
    const text = await r.text();
    const dir = (ROOT + '/' + f).replace(/\/[^/]*$/, '');
    py.FS.mkdirTree(dir);
    py.FS.writeFile(ROOT + '/' + f, text);
  }));
  // Captured so that frontend warnings reach the page, not the console.
  let log = [];
  py.setStdout({ batched: (s) => log.push(s) });
  py.setStderr({ batched: (s) => log.push(s) });
  py.runPython(COMPILE);
  const compile = py.globals.get('compile_kairos');
  return (source) => {
    log = [];
    const [ok, text] = compile(source).toJs();
    return { ok, text, log };
  };
})();

ready.then(() => postMessage({ type: 'ready' }),
           (e) => postMessage({ type: 'fatal', text: String(e) }));

onmessage = async (e) => {
  try {
    const compile = await ready;
    postMessage({ type: 'compiled', id: e.data.id, ...compile(e.data.source) });
  } catch (err) {
    postMessage({ type: 'compiled', id: e.data.id, ok: false, text: String(err), log: [] });
  }
};

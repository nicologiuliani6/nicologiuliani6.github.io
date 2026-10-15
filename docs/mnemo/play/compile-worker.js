// Mnemo in Pyodide: C source -> Kairos (Mnemo) -> bytecode (Kairos frontend).
// pcpp stands in for `gcc -E`; Mnemo's own fake libc headers make the
// preprocessed output the same as with gcc.
importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js');

const ROOT = '/home/pyodide/mnemo-web';
const SOURCES = [
  { base: 'py/', dest: ROOT },                       // mnemo, pcpp
  { base: '../../kairos/play/py/', dest: ROOT },     // Kairos frontend (src/), ply
];

const COMPILE = `
import io, re, shutil, sys
sys.path.insert(0, ${JSON.stringify(ROOT)})
sys.setrecursionlimit(4000)

_which = shutil.which
shutil.which = lambda name, *a, **k: '/usr/bin/gcc' if name == 'gcc' else _which(name, *a, **k)

def _preprocess_file(path, cpp_path=None, cpp_args=()):
    """pcpp in place of pycparser.preprocess_file(path, cpp_path='gcc', cpp_args)."""
    from pcpp import Preprocessor
    p = Preprocessor()
    p.line_directive = '#line'
    p.compress = 0
    errors = []
    p.on_error = lambda file, line, msg: errors.append(f"line {line}: {msg}")
    includes, args, i = [], list(cpp_args), 0
    while i < len(args):
        a = args[i]
        if a.startswith('-I'):
            p.add_path(a[2:])
        elif a.startswith('-D'):
            name, _, val = a[2:].partition('=')
            p.define(f"{name} {val or 1}")
        elif a == '-include':
            includes.append(args[i + 1]); i += 1
        i += 1
    with open(path, encoding='utf-8') as f:
        # like gcc -include: the forced headers must not shift the line numbers
        text = ''.join(f'#include "{h}"\\n' for h in includes) + f'#line 1 "{path}"\\n' + f.read()
    p.parse(text, path)
    out = io.StringIO()
    p.write(out)
    if errors:
        raise RuntimeError('preprocessor: ' + '; '.join(errors))
    return out.getvalue()

def compile_c(source):
    # Fresh modules every time: both compilers keep state in module globals.
    for name in [m for m in sys.modules if m.split('.')[0] in ('src', 'mnemo')]:
        del sys.modules[name]
    import mnemo.c_parse
    mnemo.c_parse.preprocess_file = _preprocess_file
    from mnemo.compile import compile_c_to_kairos
    from mnemo.errors import MnemoCompileError
    with open('/tmp/program.c', 'w', encoding='utf-8') as f:
        f.write(source)
    try:
        kairos = compile_c_to_kairos('/tmp/program.c')
    except MnemoCompileError as exc:
        return [False, f"mnemo: {exc}".replace('/tmp/program.c', 'program.c'), ""]
    except RecursionError:
        return [False, "mnemo: program too deeply nested for the browser playground", ""]
    except Exception as exc:
        return [False, f"mnemo: internal error: {exc}", ""]

    from src.frontend.lexer import lexer
    from src.frontend.parser import parser, run_static_checks, desugar_try
    from src.frontend.bytecode import ByteCode_Compiler
    from src.frontend.errors import KairosCompileError
    try:
        ast = parser.parse(kairos, lexer=lexer)
        if ast is None:
            raise KairosCompileError("PARSER", "compilation stopped: no AST produced")
        ast = desugar_try(ast)
        run_static_checks(ast)
        bt = ByteCode_Compiler()
        bt.process(ast)
    except KairosCompileError as exc:
        return [False, f"kairos: {exc}", kairos]
    except RecursionError:
        return [False, "kairos: generated program too deeply nested for the browser playground", kairos]
    except Exception as exc:
        return [False, f"kairos: internal error: {exc}", kairos]
    lines = []
    while not bt.queue.empty():
        _phys, src_tag, instr = bt.queue.get()
        lines.append(f"{src_tag:<6}  {instr}")
    return [True, "\\n".join(lines) + "\\n", kairos]
`;

async function fetchTree(py, { base, dest }) {
  const list = (await (await fetch(base + 'files.txt')).text()).split('\n').filter(Boolean);
  await Promise.all(list.map(async (f) => {
    const text = await (await fetch(base + f)).text();
    py.FS.mkdirTree((dest + '/' + f).replace(/\/[^/]*$/, ''));
    py.FS.writeFile(dest + '/' + f, text);
  }));
}

const ready = (async () => {
  const py = await loadPyodide();
  await py.loadPackage('pycparser');
  for (const s of SOURCES) await fetchTree(py, s);
  let log = [];
  py.setStdout({ batched: (s) => log.push(s) });
  py.setStderr({ batched: (s) => log.push(s) });
  py.runPython(COMPILE);
  const compile = py.globals.get('compile_c');
  return (source) => {
    log = [];
    const [ok, text, kairos] = compile(source).toJs();
    return { ok, text, kairos, log };
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

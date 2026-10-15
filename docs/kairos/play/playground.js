// In-browser playground shared by the Kairos and Mnemo docs pages.
//
// A compile worker (Pyodide) turns the source into Kairos bytecode; a fresh
// VM worker (WebAssembly + pthreads) runs it, and is terminated to stop it.
// The page must be cross-origin isolated (see coi-serviceworker.js).
//
// KairosPlayground({
//   compileWorker: URL of the compile worker,
//   vmWorker: URL of vm-worker.js (default: next to this script). It must be inside the
//             page's service-worker scope, or Firefox blocks it for missing COEP headers,
//   examples: [{ title, desc, file } | { title, desc, text }],  file relative to examplesBase
//   examplesBase: 'examples/',
//   initial: index of the example loaded first,
//   timeoutMs: run time limit,
//   filter: () => ({ line(stream, text) -> {text, cls} | 'clear' | null | an array of these,
//                    done() -> string | null }),
//   onCompiled: (result) => void,   result.extra holds what the compile worker adds
//   language: 'kairos' | 'c'   (syntax highlighting in the editor)
// })
// KairosPlayground.highlight(text, language) returns the highlighted HTML.
(function () {
  const DEFAULT_VM_WORKER = new URL('vm-worker.js', document.currentScript.src).href;

  const words = (s) => new Set(s.split(' '));
  const GRAMMARS = {
    // reserved words from kairos/src/frontend/lexer.py, plus the builtins
    kairos: {
      kw: words('procedure local delocal call uncall if then else fi from do loop until par and rap try rollback yrt skip'),
      type: words('int stack channel nil empty char'),
      fn: words('show push pop ssend srecv'),
      strings: false, preproc: false,
    },
    c: {
      kw: words('if else for while do switch case default break continue return goto sizeof typedef struct union enum ' +
                'static const extern volatile register inline restrict try rollback'),
      type: words('void int char short long unsigned signed bool _Bool size_t int8_t int16_t int32_t int64_t ' +
                  'uint8_t uint16_t uint32_t uint64_t NULL true false'),
      fn: words('printf putchar puts malloc calloc free memcpy memset strlen strcmp strcpy'),
      strings: true, preproc: true,
    },
  };
  const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(^[ \t]*#[^\n]*)|\b(0[xX][0-9a-fA-F]+|\d+)\b|([A-Za-z_]\w*)/gm;
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function highlight(text, language) {
    const g = GRAMMARS[language] || GRAMMARS.kairos;
    let html = '', last = 0;
    for (const m of text.matchAll(TOKEN)) {
      let cls = null;
      if (m[1]) cls = 'com';
      else if (m[2]) cls = g.strings ? 'str' : null;
      else if (m[3]) cls = g.preproc ? 'pre' : null;
      else if (m[4]) cls = 'num';
      else if (g.kw.has(m[5])) cls = 'kw';
      else if (g.type.has(m[5])) cls = 'type';
      else if (g.fn.has(m[5])) cls = 'fn';
      if (!cls) continue;
      html += esc(text.slice(last, m.index)) + `<span class="hl-${cls}">${esc(m[0])}</span>`;
      last = m.index + m[0].length;
    }
    return html + esc(text.slice(last));
  }

  window.KairosPlayground = function (opts) {
    const $ = (id) => document.getElementById(id);
    const src = $('play-src'), out = $('play-out'), status = $('play-status');
    const runBtn = $('play-run'), stopBtn = $('play-stop'), dl = $('play-dl'), tabs = $('play-tabs');
    const base = opts.examplesBase || 'examples/';
    const passthrough = () => ({ line: (stream, text) => ({ text, cls: stream === 'out' ? null : stream }), done: () => null });
    const makeFilter = opts.filter || passthrough;
    const language = opts.language || 'kairos';

    // Highlighted copy behind the (transparent) textarea, kept in sync.
    const editor = document.createElement('div');
    editor.className = 'play-editor';
    const hl = document.createElement('pre');
    hl.className = 'play-hl';
    hl.setAttribute('aria-hidden', 'true');
    const hlCode = document.createElement('code');
    hl.appendChild(hlCode);
    src.parentNode.insertBefore(editor, src);
    editor.append(hl, src);
    const syncScroll = () => { hl.scrollTop = src.scrollTop; hl.scrollLeft = src.scrollLeft; };
    // trailing space: a final newline must still get its own line in the <pre>
    const render = () => { hlCode.innerHTML = highlight(src.value, language) + ' '; syncScroll(); };
    const setSource = (text) => { src.value = text; src.scrollTop = 0; render(); };
    src.addEventListener('input', render);
    src.addEventListener('scroll', syncScroll);

    let compiler = null, compilerReady = null, nextId = 1, frontendLoaded = false;
    const pending = new Map();
    let vm = null, timer = null, filter = null;

    function startCompiler() {
      if (compilerReady) return compilerReady;
      compilerReady = new Promise((resolve, reject) => {
        compiler = new Worker(opts.compileWorker);
        compiler.onmessage = (e) => {
          const m = e.data;
          if (m.type === 'ready') resolve();
          else if (m.type === 'fatal') reject(new Error(m.text));
          else if (m.type === 'compiled') { pending.get(m.id)(m); pending.delete(m.id); }
        };
        compiler.onerror = (e) => reject(new Error(e.message || 'compiler worker failed'));
      });
      compilerReady.catch(() => { compilerReady = null; });
      return compilerReady;
    }

    function compile(source) {
      const id = nextId++;
      return new Promise((resolve) => { pending.set(id, resolve); compiler.postMessage({ id, source }); });
    }

    function clearOut() { out.textContent = ''; }

    // Appends a batch of lines with a single layout pass.
    function printLines(items) {
      const frag = document.createDocumentFragment();
      for (const { text, cls } of items) {
        const span = document.createElement('span');
        if (cls) span.className = cls;
        span.textContent = text + '\n';
        frag.appendChild(span);
      }
      out.appendChild(frag);
      out.scrollTop = out.scrollHeight;
    }
    const print = (text, cls) => printLines([{ text, cls }]);

    function onVmLines(lines) {
      let batch = [];
      for (const l of lines) {
        const r = l.stream === 'meta' ? { text: l.text, cls: 'meta' } : filter.line(l.stream, l.text);
        for (const item of Array.isArray(r) ? r : [r]) {
          if (item === 'clear') { batch = []; clearOut(); }
          else if (item) batch.push(item);
        }
      }
      if (batch.length) printLines(batch);
    }

    function setRunning(on) { runBtn.disabled = on; stopBtn.disabled = !on; }

    function finish(msg) {
      clearTimeout(timer);
      if (vm) { vm.terminate(); vm = null; }
      setRunning(false);
      status.textContent = msg;
    }

    async function run() {
      if (!window.crossOriginIsolated) {
        clearOut();
        print('The playground needs SharedArrayBuffer for the VM threads, and this page is not cross-origin isolated yet. ' +
              'Reload the page once; if it still fails, your browser blocks service workers here (private windows often do).', 'err');
        return;
      }
      setRunning(true);
      clearOut();
      try {
        if (!frontendLoaded) status.textContent = 'loading the compiler (first run only)…';
        await startCompiler();
        frontendLoaded = true;
      } catch (err) {
        print('Could not load the compiler: ' + err.message, 'err');
        finish('');
        return;
      }
      status.textContent = 'compiling…';
      const res = await compile(src.value);
      if (opts.onCompiled) opts.onCompiled(res);
      res.log.forEach((l) => print(l, 'meta'));
      if (!res.ok) { print(res.text, 'err'); finish('compile error'); return; }

      status.textContent = 'running…';
      filter = makeFilter();
      const t0 = performance.now();
      vm = new Worker(opts.vmWorker || DEFAULT_VM_WORKER);
      vm.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'out') onVmLines(m.lines);
        else if (m.type === 'done') {
          if (m.text) print(m.text, 'err');
          const extra = filter.done();
          if (extra) print(extra, 'meta');
          const ms = Math.round(performance.now() - t0);
          finish(m.ok ? `done in ${ms} ms` : 'stopped with an error');
        }
      };
      vm.onerror = (e) => { print('VM error: ' + (e.message || 'worker failed'), 'err'); finish('VM error'); };
      vm.postMessage({ bytecode: res.text });
      const limit = opts.timeoutMs || 15000;
      timer = setTimeout(() => { print(`Stopped after ${limit / 1000} s.`, 'meta'); finish('timed out'); }, limit);
    }

    async function load(ex, btn) {
      [...tabs.children].forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      $('play-desc').textContent = ex.desc;
      dl.hidden = !ex.file;
      if (ex.text !== undefined) { setSource(ex.text); return; }
      dl.href = base + ex.file;
      dl.setAttribute('download', ex.file);
      dl.textContent = 'Download ' + ex.file;
      try {
        const r = await fetch(base + ex.file);
        setSource(r.ok ? await r.text() : '// could not load ' + ex.file);
      } catch { setSource('// could not load ' + ex.file); }
    }

    opts.examples.forEach((ex, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = ex.title;
      b.addEventListener('click', () => { load(ex, b); startCompiler().catch(() => {}); });
      tabs.appendChild(b);
      if (i === (opts.initial || 0)) load(ex, b);
    });

    runBtn.addEventListener('click', run);
    stopBtn.addEventListener('click', () => { print('Stopped.', 'meta'); finish('stopped'); });
    src.addEventListener('focus', () => startCompiler().catch(() => {}), { once: true });
    src.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!runBtn.disabled) run(); }
    });
  };
  window.KairosPlayground.highlight = highlight;
})();

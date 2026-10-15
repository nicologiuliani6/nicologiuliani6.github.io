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
// })
(function () {
  const DEFAULT_VM_WORKER = new URL('vm-worker.js', document.currentScript.src).href;

  window.KairosPlayground = function (opts) {
    const $ = (id) => document.getElementById(id);
    const src = $('play-src'), out = $('play-out'), status = $('play-status');
    const runBtn = $('play-run'), stopBtn = $('play-stop'), dl = $('play-dl'), tabs = $('play-tabs');
    const base = opts.examplesBase || 'examples/';
    const passthrough = () => ({ line: (stream, text) => ({ text, cls: stream === 'out' ? null : stream }), done: () => null });
    const makeFilter = opts.filter || passthrough;

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
      if (ex.text !== undefined) { src.value = ex.text; return; }
      dl.href = base + ex.file;
      dl.setAttribute('download', ex.file);
      dl.textContent = 'Download ' + ex.file;
      try {
        const r = await fetch(base + ex.file);
        src.value = r.ok ? await r.text() : '// could not load ' + ex.file;
      } catch { src.value = '// could not load ' + ex.file; }
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
})();

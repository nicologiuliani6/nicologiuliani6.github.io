// Runs one Kairos bytecode program on the WebAssembly VM. The page starts a
// fresh worker for every run and terminates it afterwards (or to stop it).
//
// Emscripten starts the VM's pthreads from this same script URL, named
// 'em-pthread': in that case the VM script sets itself up as a thread.
importScripts('kairos-vm.js');

if (self.name !== 'em-pthread') {
  onmessage = async (e) => {
    // Output is batched and capped: a program printing in an endless loop
    // must not flood the page with messages.
    const MAX_LINES = 5000;
    let buf = [], sent = 0, last = 0;
    const flush = () => { if (buf.length) { postMessage({ type: 'out', lines: buf }); buf = []; } };
    const send = (stream, text) => {
      if (sent >= MAX_LINES) return;
      buf.push({ stream, text });
      if (++sent === MAX_LINES) {
        buf.push({ stream: 'meta', text: `… output truncated after ${MAX_LINES} lines` });
        flush();
        return;
      }
      const now = performance.now();
      if (now - last > 50 || buf.length >= 200) { flush(); last = now; }
    };
    let M;
    try {
      M = await KairosVM({
        print: (t) => send('out', t),
        printErr: (t) => send('err', t),
        // stats: the VM prints "=== VM stats ===" (live cells) after the dump
        preRun: [(mod) => { if (e.data.stats) mod.ENV.KAIROS_VM_STATS = '1'; }],
      });
    } catch (err) {
      flush();
      postMessage({ type: 'done', ok: false, text: 'could not start the VM: ' + err });
      return;
    }
    try {
      M._vm_run_from_string(M.stringToNewUTF8(e.data.bytecode));
      flush();
      postMessage({ type: 'done', ok: true });
    } catch (err) {
      // vm_debug_panic() calls exit(1), which surfaces here as ExitStatus
      const status = err && err.name === 'ExitStatus' ? err.status : null;
      flush();
      postMessage({ type: 'done', ok: status === 0,
                    text: status === null ? String(err) : null });
    }
  };
}

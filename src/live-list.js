// Coalesce bursts without losing an update that arrives during a refresh.
export function createLiveRefresh(refresh, onError, delay = 1500) {
  let timer, running = false, dirty = false, stopped = false;
  async function run() {
    timer = undefined;
    if (stopped || running) return;
    dirty = false;
    running = true;
    try { await refresh(); }
    catch (error) { onError(error); }
    finally {
      running = false;
      if (dirty && !stopped) schedule();
    }
  }
  function schedule() {
    if (stopped) return;
    dirty = true;
    if (!running && !timer) { timer = setTimeout(run, delay); timer.unref?.(); }
  }
  return { schedule, stop() { stopped = true; clearTimeout(timer); } };
}

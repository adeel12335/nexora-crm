/** One-at-a-time disk work so Hostinger I/O does not stall parallel uploads. */
let tail = Promise.resolve();

export function enqueueUploadWork(task) {
  const run = tail.then(task, task);
  tail = run.then(() => undefined, () => undefined);
  return run;
}

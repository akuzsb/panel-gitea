async function asyncPool(limit, items, iterator) {
  if (limit < 1) {
    throw new Error('El limite de concurrencia debe ser mayor o igual a 1.');
  }

  const tasks = [];
  const executing = [];

  for (const item of items) {
    const task = Promise.resolve().then(() => iterator(item));
    tasks.push(task);

    if (limit <= items.length) {
      const cleanup = task.then(() => {
        const index = executing.indexOf(cleanup);
        if (index >= 0) {
          executing.splice(index, 1);
        }
      });
      executing.push(cleanup);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }

  await Promise.all(executing);
  return Promise.all(tasks);
}

module.exports = { asyncPool };

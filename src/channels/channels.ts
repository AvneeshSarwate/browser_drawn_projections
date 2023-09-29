

//define an async function that waits using setTimeout
async function wait(ms: number) {
  return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
          resolve();
      }, ms);
  });
}

function branch<T>(block: () => Promise<T>): Promise<T> {
    return block();
}

const res = branch(async () => {
  console.log('start')
  wait(10)
  console.log('end')
})

res.then(() => {
    console.log('done')
})



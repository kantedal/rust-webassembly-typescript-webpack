const wasm = require('../src/main.rs')

wasm.initialize().then((module: any) => {
  const add = module.cwrap('add', 'number', ['number', 'number'])

  console.log(add(5, 5))
  console.log(add(5, 3))
  console.log(add(5, 2))
  console.log(add(5, 1))
  console.log(add(5, 4))
})

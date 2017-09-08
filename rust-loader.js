const child_process = require('child_process')
const fs = require('fs')
const loaderUtils = require('loader-utils')
const path = require('path')
const toml = require('toml')

module.exports = function(source) {
    // Indicate that this loader is asynchronous
    const callback = this.async()
    const srcDir = path.dirname(path.dirname(this.resourcePath))
    // Find the rust package name in the Cargo.toml
    const packageName = toml.parse(
        fs.readFileSync(path.join(srcDir, 'Cargo.toml'), 'utf8').toString()
    ).package.name

    const opts = loaderUtils.getOptions(this)
    const release = opts ? opts.release : false

    const buildPath = opts ? opts.path : undefined
    if (buildPath === undefined) {
        return callback(
            new Error(
                'You must set the `path` option to the path to webpack output relative to project root'
            ),
            null
        )
    }

    const rustTarget = `wasm32-unknown-emscripten`

    const outDir = path.join(
        srcDir,
        'target',
        rustTarget,
        release ? 'release' : 'debug'
    )
    const outFile = path.join(outDir, `${packageName}.js`)
    const cmd = `cargo rustc --target=${rustTarget}${release ? ' --release' : ''} -- -Clink-args="-s NO_EXIT_RUNTIME=1"`
    const self = this
    child_process.exec(cmd, { cwd: this.context }, function(
        error,
        stdout,
        stderr
    ) {
        if (error) {
            return callback(error, null)
        }

        // Get the contents of the javascript 'glue' code generated by Emscripten
        const out = fs.readFileSync(outFile, 'utf8')

        // Get the contents of the wasm file generated by Emscripten
        const wasmFile = fs
            .readdirSync(path.join(outDir, 'deps'))
            .find(f => /\.wasm$/.test(f))
        if (!wasmFile) {
            return callback(new Error('No wasm file found', null))
        }

        // Emit the wasm file
        self.emitFile(
            `${packageName}.wasm`,
            fs.readFileSync(path.join(outDir, 'deps', wasmFile))
        )

        // This object is passed to the Emscripten 'glue' code
        const Module = {
            // Path in the built project to the wasm file
            wasmBinaryFile: path.join(buildPath, `${packageName}.wasm`),
            // Indicates that we are NOT running in node, despite 'require' being defined
            ENVIRONMENT: 'WEB',
        }
        const glue = `module.exports = (function(existingModule){
      return {
        // Returns a promise that resolves when the wasm runtime is initialized and ready for use
        initialize: function(userDefinedModule) {
          return new Promise((resolve, reject) => {
            if (!userDefinedModule) {
              userDefinedModule = {}
            }
            var Module = Object.assign({}, userDefinedModule, existingModule);
            Module['onRuntimeInitialized'] = () => resolve(Module);
            \n${out}\n
          });
        }
      }
    })(${JSON.stringify(Module)})`

        return callback(null, glue)
    })
}

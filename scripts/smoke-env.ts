// Must be imported FIRST so src/util.ts reads these before computing paths.
process.env.HARNESS_DATA = process.env.SPRIG_SMOKE_DATA || require('os').tmpdir() + '/sprig-smoke-data';
process.env.HARNESS_WORKSPACE = process.env.SPRIG_SMOKE_WORKSPACE || require('os').tmpdir() + '/sprig-smoke-workspace';
process.env.HARNESS_SKILLS = process.env.SPRIG_SMOKE_SKILLS || require('os').tmpdir() + '/sprig-smoke-skills';
process.env.HARNESS_PLUGINS = process.env.SPRIG_SMOKE_PLUGINS || require('os').tmpdir() + '/sprig-smoke-plugins';

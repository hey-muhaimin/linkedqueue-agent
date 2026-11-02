// Must be imported FIRST so src/util.ts reads these before computing paths.
process.env.HARNESS_DATA = process.env.LINKEDQUEUE_SMOKE_DATA || require('os').tmpdir() + '/linkedqueue-smoke-data';
process.env.HARNESS_WORKSPACE = process.env.LINKEDQUEUE_SMOKE_WORKSPACE || require('os').tmpdir() + '/linkedqueue-smoke-workspace';
process.env.HARNESS_SKILLS = process.env.LINKEDQUEUE_SMOKE_SKILLS || require('os').tmpdir() + '/linkedqueue-smoke-skills';
process.env.HARNESS_PLUGINS = process.env.LINKEDQUEUE_SMOKE_PLUGINS || require('os').tmpdir() + '/linkedqueue-smoke-plugins';

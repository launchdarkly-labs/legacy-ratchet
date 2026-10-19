/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
  },
};

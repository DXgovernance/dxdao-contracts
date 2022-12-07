module.exports = {
  skipFiles: ["test/", "utils/", "hardhat-dependency-compiler/"],
  istanbulReporter: ["lcov"],
  configureYulOptimizer: true,
};

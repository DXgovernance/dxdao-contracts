const fs = require("fs");
const path = require("path");
const docsConfig = require("../docs/config");

const INPUT_DIR = "contracts";
const CONFIG_DIR = "docs/";
const OUTPUT_DIR = "docs/contracts";
const README_FILE = "README.md";
const SUMMARY_FILE = "docs/SUMMARY.md";

const excludeList = docsConfig.exclude.map(line => INPUT_DIR + "/" + line);
const relativePath = path.relative(path.dirname(SUMMARY_FILE), OUTPUT_DIR);

function buildSummary(pathName, indentation) {
  if (!excludeList.includes(pathName)) {
    if (fs.lstatSync(pathName).isDirectory()) {
      fs.appendFileSync(
        SUMMARY_FILE,
        indentation + "* " + path.basename(pathName) + "\n"
      );
      for (const fileName of fs.readdirSync(pathName))
        buildSummary(pathName + "/" + fileName, indentation + "  ");
    } else if (pathName.endsWith(".sol")) {
      const text = path.basename(pathName).slice(0, -4);
      const link = pathName.slice(INPUT_DIR.length, -4);
      fs.appendFileSync(
        SUMMARY_FILE,
        indentation +
          "* [" +
          text +
          "](/" +
          CONFIG_DIR +
          relativePath +
          link +
          ".md)\n"
      );
    }
  }
}

fs.writeFileSync(SUMMARY_FILE, "# Summary\n");
fs.writeFileSync(".gitbook.yaml", "root: ./\n");
fs.appendFileSync(".gitbook.yaml", "structure:\n");
fs.appendFileSync(".gitbook.yaml", "  readme: " + README_FILE + "\n");
fs.appendFileSync(".gitbook.yaml", "  summary: " + SUMMARY_FILE + "\n");

buildSummary(INPUT_DIR, "");

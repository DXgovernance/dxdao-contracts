const fs = require("fs");
const path = require("path");

const INPUT_DIR = "docs/contracts";
const README_FILE = "README.md";
const SUMMARY_FILE = "docs/SUMMARY.md";

function buildSummary(pathName, indentation) {
  if (fs.lstatSync(pathName).isDirectory()) {
    fs.appendFileSync(
      SUMMARY_FILE,
      indentation + "* /" + path.basename(pathName) + "\n"
    );
    for (const fileName of fs.readdirSync(pathName))
      buildSummary(pathName + "/" + fileName, indentation + "  ");
  } else if (pathName.endsWith(".md")) {
    const text = path.basename(pathName).slice(0, -3);
    fs.appendFileSync(
      SUMMARY_FILE,
      indentation + "* [" + text + "](/" + pathName + ")\n"
    );
  }
}

fs.writeFileSync(SUMMARY_FILE, "# Summary\n");
fs.writeFileSync(".gitbook.yaml", "root: ./\n");
fs.appendFileSync(".gitbook.yaml", "structure:\n");
fs.appendFileSync(".gitbook.yaml", "  readme: " + README_FILE + "\n");
fs.appendFileSync(".gitbook.yaml", "  summary: " + SUMMARY_FILE + "\n");

buildSummary(INPUT_DIR, "");

const fs = require("fs");
const path = require("path");
const dir = __dirname;

const header = fs.readFileSync(path.join(dir, "header.txt"), "utf8");
const footer = fs.readFileSync(path.join(dir, "footer.txt"), "utf8");
// Settings before module-page: ensureBrotStyles() must be defined
// before module-page.js calls it at runtime.
const modules = ["core.js", "settings.js", "module-page.js", "exams.js", "runtime.js"];

const body = modules
  .map((m) => fs.readFileSync(path.join(dir, "modules", m), "utf8"))
  .join("\n"); // modules include their own trailing blank lines

const out = path.join(dir, "script.user.js");
fs.writeFileSync(out, header + "\n" + body + "\n" + footer);
const size = fs.statSync(out).size;
console.log(`Built script.user.js (${size} bytes, ${modules.length} modules)`);

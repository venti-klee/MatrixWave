import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const output = new URL("./dist/", import.meta.url);
if (existsSync(output)) rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

execFileSync(process.execPath, ["--check", "app.js"], { stdio: "inherit" });
for (const file of ["index.html", "styles.css", "app.js", "README.md"]) {
  cpSync(new URL(`./${file}`, import.meta.url), new URL(`./dist/${file}`, import.meta.url));
}

console.log("MatrixWave production files created in dist/");

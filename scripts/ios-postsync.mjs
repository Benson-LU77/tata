/**
 * cap sync regenerates ios/App/App/capacitor.config.json and only lists
 * npm-packaged plugins in packageClassList. The Vault plugin lives in the
 * app target itself, so its class name is appended here — this is the
 * documented registration road (NSClassFromString at bridge boot).
 */
import { readFileSync, writeFileSync } from "node:fs";

const path = "ios/App/App/capacitor.config.json";
const config = JSON.parse(readFileSync(path, "utf8"));
config.packageClassList = [...new Set([...(config.packageClassList ?? []), "VaultPlugin"])];
writeFileSync(path, JSON.stringify(config, null, "\t") + "\n");
console.log("packageClassList:", config.packageClassList);

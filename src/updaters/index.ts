import type { UpdaterType } from "../config.js";
import { UpdaterError } from "./errors.js";
import { updateGeneric } from "./generic.js";
import { updateGradle } from "./gradle.js";
import { updatePackageJson } from "./package-json.js";
import { updatePomXml } from "./pom-xml.js";

export { UpdaterError };

export type UpdaterFn = (content: string, version: string, file: string) => string;

const updaters: Record<UpdaterType, UpdaterFn> = {
  "package-json": updatePackageJson,
  "pom-xml": updatePomXml,
  gradle: updateGradle,
  generic: updateGeneric,
};

export function applyUpdater(type: UpdaterType, content: string, version: string, file: string): string {
  return updaters[type](content, version, file);
}

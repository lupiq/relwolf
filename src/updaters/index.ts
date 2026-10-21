import path from 'node:path';

import type {UpdaterType} from '../config.js';
import {updateDotnet} from './dotnet.js';
import {UpdaterError} from './errors.js';
import {updateGeneric} from './generic.js';
import {updateGradle} from './gradle.js';
import {updateJson, updatePackageLock} from './json.js';
import {updatePackageJson} from './package-json.js';
import {updatePomXml} from './pom-xml.js';
import {
  cargoName,
  updateCargo,
  updateCargoLock,
  updatePyproject,
  updateToml,
} from './toml.js';
import {updateHelm, updateYaml} from './yaml.js';

export {UpdaterError};

export type UpdaterFn = (
  content: string,
  version: string,
  file: string,
  key: string,
) => string;

const updaters: Record<UpdaterType, UpdaterFn> = {
  'package-json': updatePackageJson,
  'pom-xml': updatePomXml,
  'gradle': updateGradle,
  'pyproject': updatePyproject,
  'cargo': updateCargo,
  'dotnet': updateDotnet,
  'helm': updateHelm,
  'json': updateJson,
  'yaml': updateYaml,
  'toml': updateToml,
  'generic': updateGeneric,
};

export function applyUpdater(
  type: UpdaterType,
  content: string,
  version: string,
  file: string,
  key = '',
): string {
  return updaters[type](content, version, file, key);
}

export interface Companion {
  path: string;
  update: (content: string, version: string) => string;
}

/**
 * Lockfiles next to a manifest that repeat the project's own version. They are updated together with the manifest
 * if they exist; `manifest` is the already updated content.
 */
export function companions(
  type: UpdaterType,
  file: string,
  manifest: string,
): Companion[] {
  const dir = path.posix.dirname(file);
  const sibling = (name: string): string =>
    dir === '.' ? name : path.posix.join(dir, name);

  if (type === 'package-json') {
    return ['package-lock.json', 'npm-shrinkwrap.json'].map(name => ({
      path: sibling(name),
      update: (content, version) =>
        updatePackageLock(content, version, sibling(name)),
    }));
  }

  if (type === 'cargo') {
    const name = cargoName(manifest);

    if (name === undefined) {
      return [];
    }

    return [
      {
        path: sibling('Cargo.lock'),
        update: (content, version) =>
          updateCargoLock(content, version, sibling('Cargo.lock'), name),
      },
    ];
  }

  return [];
}

import path from 'node:path';

import {
  addDependenciesToPackageJson,
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  type Tree,
  updateJson,
  workspaceRoot,
} from '@nx/devkit';
import { libraryGenerator as jsLibGenerator } from '@nx/js';

import type { LibGeneratorSchema } from './schema.d.ts';

/**
 * Knexe custom Nx JS/TS library generator.
 *
 * This generator wraps the default @nx/js:library generator
 * and customizes it to:
 *  - disable ESLint (handled at the root level),
 *  - replace the bundler with tsdown,
 *  - add modern TypeScript settings,
 *  - optionally make the package publishable,
 *  - scaffold extra configuration files.
 */
export async function libGenerator(
  tree: Tree,
  inputOptions: LibGeneratorSchema
) {
  const { directory, name, publishable = false, ...options } = inputOptions;

  // Always resolve the project root relative to the Nx workspace root
  const projectRoot = path.join(workspaceRoot, directory);

  const callbackAfterFilesUpdated = await jsLibGenerator(tree, {
    ...options,
    directory,
    bundler: 'none',
    linter: 'none',
    publishable: false,
    unitTestRunner: 'none',
    includeBabelRc: false,
    js: false,
    minimal: true,
    strict: true,
    setParserOptionsProject: false,
  });

  addProjectConfiguration(tree, name, {
    root: directory,
    projectType: 'library',
    sourceRoot: `${directory}/src`,
    targets: {
      build: {
        executor: 'nx:run-commands',
        options: {
          command: 'tsdown build',
        },
        dependsOn: ['^install'],
      },
      dev: {
        executor: 'nx:run-commands',
        options: {
          command: 'tsdown watch',
        },
      },
      install: {
        executor: 'nx:run-commands',
        options: {
          cwd: projectRoot,
          commands: ['npm install --ignore-scripts'],
        },
      },
      'lint:fmt': {
        executor: 'nx:run-commands',
        options: {
          cwd: projectRoot,
          command: 'eslint --fix .',
        },
        dependsOn: ['^install'],
      },
    },
  });

  // eslint-disable-next-line unicorn/prefer-module
  generateFiles(tree, path.join(__dirname, 'files'), directory, {
    tmpl: '',
    name,
    directory,
  });

  updateJson(tree, path.join(directory, 'tsconfig.lib.json'), (json) => {
    json.compilerOptions ??= {};
    json.compilerOptions.paths ??= {};
    json.compilerOptions.paths['@/*'] = ['./src/*'];
    json.compilerOptions.verbatimModuleSyntax = true;
    return json;
  });

  updateJson(tree, path.join(directory, 'package.json'), (json) => {
    json.name = `@knexe/${name}`;
    if (publishable) {
      json.private = false;
      json.publishConfig = { access: 'public' };
    } else {
      json.private = true;
    }
    return json;
  });

  addDependenciesToPackageJson(
    tree,
    {},
    {
      '@types/node': 'latest',
      tsdown: 'latest',
    }
  );

  await formatFiles(tree);

  return callbackAfterFilesUpdated;
}

export default libGenerator;

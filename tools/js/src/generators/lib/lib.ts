import path from 'node:path';

import {
  addDependenciesToPackageJson,
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  type Tree,
  updateJson,
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
  const { name, publishable = false, ...options } = inputOptions;

  const projectRoot = name;

  // Run the base Nx JS library generator with minimal settings
  const callbackAfterFilesUpdated = await jsLibGenerator(tree, {
    ...options,
    directory: projectRoot,
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

  // Add project configuration with tsdown + utility targets
  addProjectConfiguration(tree, name, {
    root: projectRoot,
    projectType: 'library',
    sourceRoot: `${projectRoot}/src`,
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

  // Generate extra template files (tsdown.config.ts, src/index.ts)
  // eslint-disable-next-line unicorn/prefer-module
  generateFiles(tree, path.join(__dirname, 'files'), projectRoot, options);

  // Update tsconfig.lib.json to enable absolute imports and verbatimModuleSyntax
  updateJson(tree, path.join(projectRoot, 'tsconfig.lib.json'), (json) => {
    json.compilerOptions ??= {};
    json.compilerOptions.paths ??= {};
    json.compilerOptions.paths['@/*'] = ['./src/*'];
    json.compilerOptions.verbatimModuleSyntax = true;
    return json;
  });

  // Update package.json of the generated project
  updateJson(tree, path.join(projectRoot, 'package.json'), (json) => {
    if (publishable) {
      json.private = false;
      json.publishConfig = { access: 'public' };
    } else {
      json.private = true;
    }
    return json;
  });

  // Add devDependencies: tsdown + @types/node (always latest)
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

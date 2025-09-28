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

  // 1. Run the base Nx JS library generator with minimal settings
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

  // 2. Add project configuration with tsdown + utility targets
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
      },
      dev: {
        executor: 'nx:run-commands',
        options: {
          command: 'tsdown watch',
        },
      },
      clean: {
        executor: 'nx:run-commands',
        options: {
          cwd: projectRoot,
          commands: ['rimraf dist'],
        },
      },
      install: {
        executor: 'nx:run-commands',
        options: {
          cwd: projectRoot,
          commands: ['npm install --ignore-scripts'],
        },
        dependsOn: ['^clean'],
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

  // 3. Generate extra template files (tsdown.config.ts, src/index.ts)
  generateFiles(
    tree,
    path.join(import.meta.dirname, 'files'),
    projectRoot,
    options
  );

  // 4. Update tsconfig.lib.json to enable absolute imports and verbatimModuleSyntax
  updateJson(tree, path.join(projectRoot, 'tsconfig.lib.json'), (json) => {
    json.compilerOptions ??= {};
    json.compilerOptions.paths ??= {};
    json.compilerOptions.paths['@/*'] = ['./src/*'];
    json.compilerOptions.verbatimModuleSyntax = true;
    return json;
  });

  // 5. Update package.json of the generated project
  updateJson(tree, path.join(projectRoot, 'package.json'), (json) => {
    if (publishable) {
      json.private = false;
      json.publishConfig = { access: 'public' };
    } else {
      json.private = true;
    }
    return json;
  });

  // 6. Add devDependencies: tsdown + @types/node (always latest)
  addDependenciesToPackageJson(
    tree,
    {},
    {
      '@types/node': 'latest',
      tsdown: 'latest',
      rimraf: 'latest',
    }
  );

  await formatFiles(tree);

  return callbackAfterFilesUpdated;
}

export default libGenerator;

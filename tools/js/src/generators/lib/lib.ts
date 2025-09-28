/* eslint-disable unicorn/prefer-module */
import { join } from 'node:path';

import {
  addDependenciesToPackageJson,
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  names,
  readProjectConfiguration,
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
  const { directory, name, publishable = false, ...options } = inputOptions;

  /** Normalize the project name for filesystem usage */
  const normalizedNames = names(name);

  /** Relative project root inside the workspace */
  const projectRoot = join(directory);

  /** Absolute path for filesystem operations */
  const absProjectRoot = join(tree.root, projectRoot);

  // Ensure the project does not already exist
  try {
    readProjectConfiguration(tree, name);
    throw new Error(`Project "${name}" already exists in Nx workspace`);
  } catch {
    // ok: project not found
  }

  // Run the base Nx JS library generator with minimal settings
  const callbackAfterFilesUpdated = await jsLibGenerator(tree, {
    ...options,
    name: normalizedNames.fileName,
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

  // Add Nx project configuration with custom build targets
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
          cwd: absProjectRoot,
          commands: ['npm install --ignore-scripts'],
        },
      },
      'lint:fmt': {
        executor: 'nx:run-commands',
        options: {
          cwd: absProjectRoot,
          command: 'eslint --fix .',
        },
        dependsOn: ['^install'],
      },
    },
  });

  // Generate extra template files (tsdown.config.ts, src/index.ts)
  generateFiles(tree, join(__dirname, 'files'), projectRoot, {
    tmpl: '',
    name,
    directory,
  });

  // Update tsconfig.lib.json to enable absolute imports and verbatimModuleSyntax
  updateJson(tree, join(projectRoot, 'tsconfig.lib.json'), (json) => {
    json.compilerOptions ??= {};
    json.compilerOptions.paths ??= {};
    json.compilerOptions.paths['@/*'] = ['./src/*'];
    json.compilerOptions.verbatimModuleSyntax = true;
    return json;
  });

  // Update package.json of the generated project
  updateJson(tree, join(projectRoot, 'package.json'), (json) => {
    json.name = `@knexe/${name}`;
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

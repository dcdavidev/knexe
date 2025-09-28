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
  updateProjectConfiguration,
} from '@nx/devkit';
import { libraryGenerator as jsLibGenerator } from '@nx/js';

import type { LibGeneratorSchema } from './schema.d.ts';

import { getLatestVersion } from '@/helpers/get-latest-version.js';

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
 *
 * If a project with the same name already exists in the Nx workspace,
 * the configuration will be updated instead of failing.
 */
export async function libGenerator(
  tree: Tree,
  inputOptions: LibGeneratorSchema
) {
  const { directory, name, publishable = false, ...options } = inputOptions;

  /** Normalize the project name */
  const normalizedNames = names(name);

  /** Relative project root (used in Nx config) */
  const projectRoot = directory ? join(directory) : normalizedNames.fileName;

  /** Absolute path for filesystem operations */
  const absProjectRoot = join(tree.root, projectRoot);

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

  /** Project configuration object shared for add/update */
  const projectConfig = {
    root: projectRoot,
    projectType: 'library' as const,
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
  };

  // Try to update config if project already exists
  try {
    readProjectConfiguration(tree, name);
    updateProjectConfiguration(tree, name, projectConfig);
  } catch {
    addProjectConfiguration(tree, name, projectConfig);
  }

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
    json.type = 'module';

    json.files = ['LICENSE', 'dist', '!**/*.tsbuildinfo'];

    if (publishable) {
      json.private = false;
      json.publishConfig = { access: 'public' };
    } else {
      json.private = true;
    }

    return json;
  });

  // Add devDependencies: tsdown + @types/node (always latest)
  const tsdownVersion = await getLatestVersion('tsdown');
  const typesNodeVersion = await getLatestVersion('@types/node');
  const rimrafVersion = await getLatestVersion('rimraf');

  addDependenciesToPackageJson(
    tree,
    {},
    {
      '@types/node': typesNodeVersion,
      tsdown: tsdownVersion,
      rimraf: rimrafVersion,
    }
  );

  await formatFiles(tree);

  return callbackAfterFilesUpdated;
}

export default libGenerator;

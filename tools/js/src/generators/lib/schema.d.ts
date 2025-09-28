/**
 * Schema for the Knexe custom Nx JS/TS library generator.
 */
export interface LibGeneratorSchema {
  /**
   * Filesystem path where the project should be created.
   * Example: "devkit/datasource/psql"
   */
  directory: string;

  /**
   * Nx project name (also used for the npm package name).
   * Example: "datasource-psql" -> package.json.name = "@knexe/datasource-psql"
   */
  name: string;

  /**
   * Whether this package should be publishable on npm.
   * @default false
   */
  publishable?: boolean;
}

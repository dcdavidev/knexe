import https from 'node:https';

/**
 * Get the latest version of a lib from the npmjs registry
 */
export async function getLatestVersion(pkg: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const encodedPkg = encodeURIComponent(pkg);

    https
      .get(`https://registry.npmjs.org/${encodedPkg}/latest`, (res) => {
        if (res.statusCode !== 200) {
          // consume and discard the response body to free up memory
          res.resume();
          reject(
            new Error(
              `Failed to resolve latest version for ${pkg}: ${res.statusCode}`
            )
          );
          return;
        }
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const { version } = JSON.parse(raw);
            if (typeof version !== 'string') {
              reject(new Error(`No version field found in ${pkg} metadata`));
              return;
            }
            resolve(version);
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

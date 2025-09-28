import https from 'node:https';

/**
 * Get the latest version of a lib from the npmjs registry
 */
export async function getLatestVersion(pkg: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(`https://registry.npmjs.org/${pkg}/latest`, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            resolve(parsed.version);
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

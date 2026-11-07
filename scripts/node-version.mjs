export function assertNodeVersion(version=process.versions.node) {
  const [major,minor]=version.split('.').map(Number);
  if(!Number.isInteger(major)||major<24||(major===24&&minor<15))throw new Error('Node.js >=24.15.0 is required (context-mode 2.x uses node:sqlite). Upgrade Node and rerun setup.');
}

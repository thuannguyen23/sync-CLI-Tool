import { assertNodeVersion } from './node-version.mjs';
try{assertNodeVersion();}catch(error){console.error(error.message);process.exitCode=1;}

import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

console.log('# Paste these into Railway Shared Variables or the backend/worker service variables.');
console.log('# Keep the full PEM blocks, including the BEGIN/END lines.');
console.log();
console.log('JWT_PUBLIC_KEY');
console.log(publicKey.trim());
console.log();
console.log('JWT_PRIVATE_KEY');
console.log(privateKey.trim());

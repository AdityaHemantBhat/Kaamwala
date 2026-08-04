import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const keysDir = path.join(__dirname, '../keys');

if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

// Generate RS256 key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

fs.writeFileSync(path.join(keysDir, 'access.private.pem'), privateKey);
fs.writeFileSync(path.join(keysDir, 'access.public.pem'), publicKey);

console.log('RS256 key pair generated successfully in keys directory.');

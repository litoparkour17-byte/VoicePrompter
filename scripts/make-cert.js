// Creates a self-signed certificate for `npm run dev:https`, so that a phone
// on the same Wi-Fi can open the dev server over HTTPS. Browsers give a page
// the microphone only over HTTPS (or on localhost).

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CERT_DIR = path.join(__dirname, '..', '.cert');
const KEY_PATH = path.join(CERT_DIR, 'key.pem');
const CERT_PATH = path.join(CERT_DIR, 'cert.pem');
const HOSTS_PATH = path.join(CERT_DIR, 'hosts.txt');

// Addresses of this computer on the local network
const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter(net => net && net.family === 'IPv4' && !net.internal)
    .map(net => net.address);

const hosts = ['DNS:localhost', 'IP:127.0.0.1', ...addresses.map(ip => `IP:${ip}`)].join(',');

// The certificate lists the addresses it is valid for, so it is made again
// when the computer gets another address.
const upToDate = fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)
    && fs.existsSync(HOSTS_PATH) && fs.readFileSync(HOSTS_PATH, 'utf8') === hosts;

if (!upToDate) {
    fs.mkdirSync(CERT_DIR, { recursive: true });
    execFileSync('openssl', [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '365',
        '-keyout', KEY_PATH, '-out', CERT_PATH,
        '-subj', '/CN=Teleprompter dev server',
        '-addext', `subjectAltName=${hosts}`,
        '-addext', 'extendedKeyUsage=serverAuth'
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
    fs.writeFileSync(HOSTS_PATH, hosts);
    console.log('Created a self-signed certificate in .cert/');
}

console.log('\nOn a phone in the same Wi-Fi open the "Network" address printed below with /app/ added,');
console.log('for example https://192.168.1.20:5173/app/, and accept the certificate warning.\n');

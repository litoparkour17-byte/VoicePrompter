import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import path from 'path'

// Dynamically gather all generated blog HTML files
const blogDir = path.resolve(__dirname, 'blog');
const blogInputs: Record<string, string> = {};
if (fs.existsSync(blogDir)) {
    const blogFiles = fs.readdirSync(blogDir).filter(f => f.endsWith('.html') && f !== 'index.html');
    blogFiles.forEach((file, index) => {
        blogInputs[`blog_article${index + 1}`] = `blog/${file}`;
    });
}

// Dynamically gather all generated use-case HTML files
const macDir = path.resolve(__dirname, 'mac');
const useCaseInputs: Record<string, string> = {};
if (fs.existsSync(macDir)) {
    const folders = fs.readdirSync(macDir).filter(f => fs.statSync(path.join(macDir, f)).isDirectory());
    folders.forEach(folder => {
        useCaseInputs[`usecase_${folder}`] = `mac/${folder}/index.html`;
    });
}

// Where the site is served from. GitHub Pages serves a project at /<repository>/.
const base = process.env.BASE_PATH || '/';

// APP_ONLY=1 builds the prompter alone, without the original project's
// website (landing pages, blog, videos, and its CNAME).
const appOnly = process.env.APP_ONLY === '1';
const appPublicDir = path.resolve(__dirname, '.app-public');
if (appOnly) {
    fs.mkdirSync(appPublicDir, { recursive: true });
    for (const file of ['favicon.ico', 'apple-touch-icon.png', 'logo-icon-no-bg.svg', 'pwa-192x192.png', 'pwa-512x512.png']) {
        fs.copyFileSync(path.resolve(__dirname, 'public', file), path.join(appPublicDir, file));
    }
    // The prompter lives in /app/; the site root leads there
    fs.writeFileSync(path.join(appPublicDir, 'index.html'),
        '<!DOCTYPE html><meta charset="UTF-8"><meta http-equiv="refresh" content="0; url=app/"><a href="app/">Суфлёр</a>\n');
}

// HTTPS=1 serves over HTTPS with the certificate made by scripts/make-cert.js,
// so a phone on the same network gets microphone access (`npm run dev:https`).
const certDir = path.resolve(__dirname, '.cert');
const https = process.env.HTTPS === '1'
    ? { key: fs.readFileSync(path.join(certDir, 'key.pem')), cert: fs.readFileSync(path.join(certDir, 'cert.pem')) }
    : undefined;

export default defineConfig({
    appType: 'mpa',
    base,
    publicDir: appOnly ? appPublicDir : 'public',
    server: { https, host: !!https },
    preview: { https, host: !!https },
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            workbox: {
                navigateFallbackDenylist: [/^\/mac/, /^\/ios/, /^\/ipad/, /^\/android/, /^\/web/, /^\/about/, /^\/blog/, /^\/changelog/, /^\/support/]
            },
            includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
            manifest: {
                name: 'Суфлёр',
                short_name: 'Суфлёр',
                description: 'Телесуфлёр с прокруткой по голосу',
                lang: 'ru',
                theme_color: '#000000',
                background_color: '#000000',
                display: 'standalone',
                start_url: `${base}app/`,
                scope: `${base}app/`,
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            }
        })
    ],
    build: {
        outDir: appOnly ? 'dist-app' : 'dist',
        rollupOptions: {
            input: appOnly ? { app: 'app/index.html' } : {
                hub: 'index.html',
                support: 'support/index.html',
                app: 'app/index.html',
                about: 'about.html',
                privacy: 'privacy.html',
                terms: 'terms.html',
                changelog: 'changelog.html',
                blog: 'blog/index.html',
                mac: 'mac/index.html',
                ios: 'ios/index.html',
                ipad: 'ipad/index.html',
                android: 'android/index.html',
                web: 'web/index.html',
                ...blogInputs,
                ...useCaseInputs
            }
        }
    }
})

#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const targetDir = process.cwd();

function getArg(flag) {
    const index = process.argv.indexOf(flag);
    return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

function getLatestVersion(packageName) {
    return new Promise((resolve) => {
        https.get(`https://registry.npmjs.org/${packageName}/latest`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const pkgInfo = JSON.parse(data);
                    resolve(`^${pkgInfo.version}`);
                } catch (e) {
                    resolve('latest');
                }
            });
        }).on('error', () => resolve('latest'));
    });
}

async function createSetup() {
    try {
        const projectId = getArg('--project') || "31902000002215215";
        const projectName = getArg('--name') || "ci-cd-pipelines";
        const orgId = getArg('--org') || "";

        console.log('🚀 Initializing your customized Catalyst + React Vite architecture...\n');
        console.log('🔍 Fetching the latest package versions from npm registry...');

        const [
            reactVer,
            reactDomVer,
            vitePluginReactVer,
            viteVer,
            typesReactVer,
            typesReactDomVer,
            expressVer,
            httpProxyVer,
            nodemonVer
        ] = await Promise.all([
            getLatestVersion('react'),
            getLatestVersion('react-dom'),
            getLatestVersion('@vitejs/plugin-react'),
            getLatestVersion('vite'),
            getLatestVersion('@types/react'),
            getLatestVersion('@types/react-dom'),
            getLatestVersion('express'),
            getLatestVersion('http-proxy'),
            getLatestVersion('nodemon')
        ]);

        console.log('✅ Latest package versions retrieved successfully!\n');

        console.log('📁 Creating project directories...');
        await fs.ensureDir(path.join(targetDir, 'client', 'src'));
        await fs.ensureDir(path.join(targetDir, 'server'));
        await fs.ensureDir(path.join(targetDir, 'scripts'));

        console.log('⚛️ Generating React + Vite client structure...');

        const viteConfigContent = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    open: false
  }
});`;
        await fs.outputFile(path.join(targetDir, 'client', 'vite.config.ts'), viteConfigContent);

        const indexHtmlContent = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Catalyst React App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`;
        await fs.outputFile(path.join(targetDir, 'client', 'index.html'), indexHtmlContent);

        const mainJsxContent = `import React from 'react';
import ReactDOM from 'react-dom/client';

function App() {
  return <div><h1>Hello from Catalyst React + Vite!</h1></div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;
        await fs.outputFile(path.join(targetDir, 'client', 'src', 'main.jsx'), mainJsxContent);

        const clientPkg = {
            name: "client",
            private: true,
            version: "1.0.0",
            type: "module",
            scripts: {
                "dev": "vite",
                "build": "vite build"
            },
            dependencies: {
                "react": reactVer,
                "react-dom": reactDomVer
            },
            devDependencies: {
                "@types/react": typesReactVer,
                "@types/react-dom": typesReactDomVer,
                "@vitejs/plugin-react": vitePluginReactVer,
                "vite": viteVer
            }
        };

        // Saved inside client folder only (no client-package.json in root)
        await fs.outputJson(path.join(targetDir, 'client', 'package.json'), clientPkg, { spaces: 2 });

        console.log('⚙️ Generating outer http-proxy server (index.js)...');

        const proxyIndexContent = `const http = require("http");
const httpProxy = require("http-proxy");

const clientPort = process.env.CLIENT_PORT || 8080;
const clientHost = process.env.CLIENT_HOST || "localhost";
const clientProtocol = "http";

const serverPort = process.env.SERVER_PORT || 8000;
const serverHost = process.env.SERVER_HOST || "localhost";
const serverProtocol = "http";

const catalystListenPort = process.env.X_ZOHO_CATALYST_LISTEN_PORT || 3001;

const clientTarget = \`\${clientProtocol}://\${clientHost}:\${clientPort}\`;
const serverTarget = \`\${serverProtocol}://\${serverHost}:\${serverPort}\`;

const proxyHandler = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: true,
    xfwd: true
});

proxyHandler.on("error", (err, req, res) => {
    console.error("Proxy Failed with following error");
    console.error(err);

    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: "FAILURE", message: "Service unavailable" }));
});

const proxyServer = http.createServer((req, res) => {
    console.log("REQUEST URL ===>>>", req.url);

    if (req.url.startsWith("/api")) {
        proxyHandler.web(req, res, { target: serverTarget });
    } else {
        proxyHandler.web(req, res, { target: clientTarget });
    }
});

proxyServer.on("error", (err) => {
    console.error("Proxy server error:", err.message);
    if (err.code === 'EADDRINUSE') {
        console.error(\`Port \${catalystListenPort} is already in use. Please free the port or use a different one.\`);
    }
    process.exit(1);
});

proxyServer.on("upgrade", (req, socket, head) => {
    console.log("Upgrade request received");
    if (req.url.startsWith("/api")) {
        proxyHandler.ws(req, socket, head, { target: serverTarget });
    } else {
        proxyHandler.ws(req, socket, head, { target: clientTarget });
    }
});

proxyServer.listen(catalystListenPort, () => {
    console.log(\`Application port ::: \${catalystListenPort}\`);
});`;
        await fs.outputFile(path.join(targetDir, 'index.js'), proxyIndexContent);
        await fs.outputFile(path.join(targetDir, '.env.local'), 'X_ZOHO_CATALYST_IS_LOCAL="true"\n');

        const rootPkg = {
            name: "catalyst-root",
            version: "1.0.0",
            description: "AppSail proxy router for Catalyst",
            main: "index.js",
            dependencies: {
                "http-proxy": httpProxyVer
            }
        };
        await fs.outputJson(path.join(targetDir, 'package.json'), rootPkg, { spaces: 2 });

        console.log('⚙️ Generating Express backend controller/server inside /server...');
        const serverIndexContent = `const express = require("express");
const app = express();
const port = process.env.SERVER_PORT || 8000;

app.use(express.json());

app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello from your Catalyst Express Backend controller!" });
});

app.listen(port, () => {
  console.log(\`Backend server listening at port \${port}\`);
});`;
        await fs.outputFile(path.join(targetDir, 'server', 'index.js'), serverIndexContent);
        await fs.outputFile(path.join(targetDir, 'server', '.env.local'), 'X_ZOHO_CATALYST_IS_LOCAL="true"\n');

        const serverPkg = {
            name: "server",
            version: "1.0.0",
            description: "Express backend routes and controllers",
            main: "index.js",
            scripts: {
                "start": "node index.js",
                "dev": "nodemon"
            },
            dependencies: {
                "express": expressVer
            },
            devDependencies: {
                "nodemon": nodemonVer
            }
        };
        await fs.outputJson(path.join(targetDir, 'server', 'package.json'), serverPkg, { spaces: 2 });
        const catalystJson = {
            "appsail": [
                {
                    "source": ".",
                    "name": "server"
                }
            ]
        };
        await fs.outputJson(path.join(targetDir, 'catalyst.json'), catalystJson, { spaces: 2 });

        const nodeMajorVersion = process.versions.node.split('.')[0];
        const appConfigJson = {
            "command": "node index.js",
            "build_path": "./build",
            "stack": `node${nodeMajorVersion}`,
            "env_variables": {
                "CLIENT_PORT": "8080",
                "CLIENT_HOST": "localhost",
                "CLIENT_PROTOCOL": "https",
                "SERVER_PORT": "8000",
                "SERVER_HOST": "localhost",
                "SERVER_PROTOCOL": "https"
            },
            "memory": 256,
            "scripts": {
                "preserve": "node ./scripts/filesHelper.js -c build",
                "postserve": "node ./scripts/filesHelper.js -d build",
                "predeploy": "node ./scripts/filesHelper.js -c build",
                "postdeploy": "node ./scripts/filesHelper.js -d build"
            }
        };
        await fs.outputJson(path.join(targetDir, 'app-config.json'), appConfigJson, { spaces: 2 });

        const catalystRcJson = {
            "defaults": {
                "project": 1,
                "env": 1
            },
            "actives": {
                "project": 1,
                "env": 1
            },
            "projects": [
                {
                    "idx": 1,
                    "id": projectId,
                    "name": projectName,
                    ...(orgId && { orgId }),
                    "domain": {
                        "id": "10135242117",
                        "name": `${projectName}-905328786.development`
                    },
                    "timezone": "Asia/Kolkata",
                    "env": [
                        {
                            "idx": 1,
                            "id": "905328786",
                            "name": "Development",
                            "type": 3
                        }
                    ]
                }
            ]
        };
        await fs.outputJson(path.join(targetDir, '.catalystrc'), catalystRcJson, { spaces: 2 });

        console.log('🛠️ Adding native file helper utilities...');
        const helperContent = `const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0];
const buildDirName = args[1];
const rootDir = process.cwd();
const dest = path.join(rootDir, buildDirName);

if (command === '-c') {
  fs.mkdirSync(dest, { recursive: true });
  const allowedItems = ['index.js', 'package.json', 'node_modules', 'server'];
  for (const item of allowedItems) {
    const srcPath = path.join(rootDir, item);
    if (fs.existsSync(srcPath)) {
      fs.cpSync(srcPath, path.join(dest, item), { recursive: true });
    }
  }
} else if (command === '-d') {
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
}`;
        await fs.outputFile(path.join(targetDir, 'scripts', 'filesHelper.js'), helperContent);

        console.log('\n📦 Installing dependencies for root, server, and client...');
        execSync('npm install', { cwd: targetDir, stdio: 'inherit' });
        execSync('npm install', { cwd: path.join(targetDir, 'server'), stdio: 'inherit' });
        execSync('npm install', { cwd: path.join(targetDir, 'client'), stdio: 'inherit' });

        console.log('\n🏗️ Building client to generate client/dist...');
        execSync('npm run build', { cwd: path.join(targetDir, 'client'), stdio: 'inherit' });

        console.log('\n🎉 Setup completed successfully without client-package.json!');

    } catch (error) {
        console.error('❌ Setup generation failed:', error);
    }
}

createSetup();
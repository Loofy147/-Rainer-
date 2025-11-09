const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const rateLimit = require('express-rate-limit');
const archiver = require('archiver');
const handlebars = require('handlebars');
const { Octokit } = require('@octokit/rest');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { AuthorizationCode } = require('simple-oauth2');
const sodium = require('libsodium-wrappers');

const app = express();
const port = 8080;

app.use(express.json());
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET || 'supersecretkey',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' },
}));


const apiRouter = express.Router();

const templatesDir = path.join(__dirname, '../../../templates');

const oauth2 = new AuthorizationCode({
    client: {
        id: process.env.GITHUB_CLIENT_ID,
        secret: process.env.GITHUB_CLIENT_SECRET,
    },
    auth: {
        tokenHost: 'https://github.com',
        tokenPath: '/login/oauth/access_token',
        authorizePath: '/login/oauth/authorize',
    },
});

const isAuthenticated = (req, res, next) => {
    if (req.session.accessToken) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
};

// Rate limiter for project creation
const createProjectLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 create requests per windowMs
  message: { error: 'Too many projects created from this IP, please try again later.' },
});

// In-memory cache for templates
let templatesCache = null;

(async () => {
    await sodium.ready;
})();

async function getTemplates() {
  if (templatesCache) {
    return templatesCache;
  }

  try {
    const templateFolders = await fs.readdir(templatesDir);
    const templates = [];

    for (const folder of templateFolders) {
      const manifestPath = path.join(templatesDir, folder, 'rainar-template.json');
      try {
        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestContent);
        templates.push({ id: folder, ...manifest });
      } catch (error) {
        // Ignore folders that don't contain a valid manifest
        console.warn(`Could not load template from '${folder}':`, error.message);
      }
    }

    templatesCache = templates;
    return templates;
  } catch (error) {
    console.error('Failed to load templates:', error);
    // Re-throw the error to be caught by the server startup logic
    throw error;
  }
}

apiRouter.get('/templates', async (req, res) => {
  const templates = await getTemplates();
  res.json(templates);
});

apiRouter.post('/projects', createProjectLimiter, async (req, res) => {
    const { name, template, config } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Project name is required' });
    }
    if (!template) {
        return res.status(400).json({ error: 'Template is required' });
    }

    const templates = await getTemplates();
    const selectedTemplate = templates.find(t => t.id === template);

    if (!selectedTemplate) {
        return res.status(400).json({ error: 'Invalid template specified' });
    }

    // Sanitize project name
    const sanitizedName = path.basename(name);
    if (sanitizedName !== name) {
        return res.status(400).json({ error: 'Invalid project name. Path traversal characters are not allowed.' });
    }

    // Sanitize template id to prevent path traversal
    const sanitizedTemplate = path.basename(template);
    if (sanitizedTemplate !== template) {
        return res.status(400).json({ error: 'Invalid template name. Path traversal characters are not allowed.' });
    }

    const templatePath = path.join(templatesDir, sanitizedTemplate);

    res.attachment(`${sanitizedName}.zip`);

    const archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
    });

    archive.on('warning', (err) => {
        if (err.code !== 'ENOENT') {
            console.error('Archive warning:', err);
        }
    });

    archive.on('error', (err) => {
        console.error('Archive error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to create archive' });
        }
        res.end();
    });

    archive.pipe(res);

    try {
        const processDirectory = async (directory, archivePath) => {
            const entries = await fs.readdir(directory, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(directory, entry.name);
                const newArchivePath = path.join(archivePath, entry.name);
                if (entry.isDirectory()) {
                    await processDirectory(fullPath, newArchivePath);
                } else {
                    const data = await fs.readFile(fullPath, 'utf8');
                    const template = handlebars.compile(data);
                    const result = template({ projectName: name, ...config });
                    archive.append(result, { name: newArchivePath });
                }
            }
        };

        await processDirectory(templatePath, '');

        await archive.finalize();

    } catch (error) {
        console.error(`Failed to create project '${name}':`, error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to create project' });
        }
    }
});

apiRouter.post('/repositories', isAuthenticated, createProjectLimiter, async (req, res) => {
    const { name, template, config } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Project name is required' });
    }
    if (!template) {
        return res.status(400).json({ error: 'Template is required' });
    }

    const templates = await getTemplates();
    const selectedTemplate = templates.find(t => t.id === template);

    if (!selectedTemplate) {
        return res.status(400).json({ error: 'Invalid template specified' });
    }

    // Sanitize project name
    const sanitizedName = path.basename(name);
    if (sanitizedName !== name) {
        return res.status(400).json({ error: 'Invalid project name. Path traversal characters are not allowed.' });
    }

    // Sanitize template id to prevent path traversal
    const sanitizedTemplate = path.basename(template);
    if (sanitizedTemplate !== template) {
        return res.status(400).json({ error: 'Invalid template name. Path traversal characters are not allowed.' });
    }

    const templatePath = path.join(templatesDir, sanitizedTemplate);

    try {
        const octokit = new Octokit({ auth: req.session.accessToken });
        const { data: repo } = await octokit.repos.createForAuthenticatedUser({
            name: sanitizedName,
            private: true,
        });

        const files = {};
        const processDirectory = async (directory, archivePath) => {
            const entries = await fs.readdir(directory, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(directory, entry.name);
                const newArchivePath = path.join(archivePath, entry.name);
                if (entry.isDirectory()) {
                    await processDirectory(fullPath, newArchivePath);
                } else {
                    const data = await fs.readFile(fullPath, 'utf8');
                    const template = handlebars.compile(data);
                    const result = template({ projectName: name, ...config });
                    files[newArchivePath] = result;
                }
            }
        };

        await processDirectory(templatePath, '');

        const owner = repo.owner.login;
        const commitMessage = 'Initial commit from Rainar';
        const blobs = await Promise.all(
            Object.entries(files).map(async ([path, content]) => {
                const { data: blob } = await octokit.git.createBlob({
                    owner,
                    repo: sanitizedName,
                    content: Buffer.from(content).toString('base64'),
                    encoding: 'base64',
                });
                return { path, sha: blob.sha, mode: '100644', type: 'blob' };
            })
        );

        const { data: { sha: newTreeSha } } = await octokit.git.createTree({
            owner,
            repo: sanitizedName,
            tree: blobs,
        });

        const { data: newCommit } = await octokit.git.createCommit({
            owner,
            repo: sanitizedName,
            message: commitMessage,
            tree: newTreeSha,
            parents: [],
        });

        await octokit.git.updateRef({
            owner,
            repo: sanitizedName,
            ref: `heads/${repo.default_branch}`,
            sha: newCommit.sha,
        });

        res.status(201).json({ url: repo.html_url, owner: repo.owner.login, repo: repo.name });
    } catch (error) {
        console.error(`Failed to create repository '${name}':`, error);
        res.status(500).json({ error: 'Failed to create repository' });
    }
});

apiRouter.post('/repositories/:owner/:repo/secrets', isAuthenticated, async (req, res) => {
    const { owner, repo } = req.params;
    const { secrets } = req.body;

    try {
        const octokit = new Octokit({ auth: req.session.accessToken });

        const { data: { key, key_id } } = await octokit.actions.getRepoPublicKey({
            owner,
            repo,
        });

        const binkey = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);

        for (const secret of secrets) {
            const binsec = sodium.from_string(secret.value);
            const encBytes = sodium.crypto_box_seal(binsec, binkey);
            const encryptedValue = sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);

            await octokit.actions.createOrUpdateRepoSecret({
                owner,
                repo,
                secret_name: secret.name,
                encrypted_value: encryptedValue,
                key_id,
            });
        }

        res.status(204).send();
    } catch (error) {
        console.error(`Failed to create secrets for repository '${owner}/${repo}':`, error);
        res.status(500).json({ error: 'Failed to create secrets' });
    }
});

apiRouter.post('/repositories/:owner/:repo/dispatch', isAuthenticated, async (req, res) => {
    const { owner, repo } = req.params;
    const { workflow_id } = req.body;

    try {
        const octokit = new Octokit({ auth: req.session.accessToken });
        await octokit.actions.createWorkflowDispatch({
            owner,
            repo,
            workflow_id,
            ref: 'main',
        });
        res.status(204).send();
    } catch (error) {
        console.error(`Failed to dispatch workflow for repository '${owner}/${repo}':`, error);
        res.status(500).json({ error: 'Failed to dispatch workflow' });
    }
});

apiRouter.get('/repositories/:owner/:repo/workflows/:workflow_id/status', isAuthenticated, async (req, res) => {
    const { owner, repo, workflow_id } = req.params;

    try {
        const octokit = new Octokit({ auth: req.session.accessToken });
        const { data } = await octokit.actions.listWorkflowRuns({
            owner,
            repo,
            workflow_id,
        });

        if (data.workflow_runs.length === 0) {
            return res.status(200).json({ status: 'not_found' });
        }

        // The API returns runs in descending order of creation time.
        const latestRun = data.workflow_runs[0];

        res.json({ status: latestRun.status, conclusion: latestRun.conclusion });
    } catch (error) {
        console.error(`Failed to get workflow status for repository '${owner}/${repo}':`, error);
        res.status(500).json({ error: 'Failed to get workflow status' });
    }
});


apiRouter.get('/auth/github', (req, res) => {
    const authorizationUri = oauth2.authorizeURL({
        redirect_uri: process.env.GITHUB_CALLBACK_URL,
        scope: 'repo',
    });
    res.redirect(authorizationUri);
});

apiRouter.get('/auth/github/callback', async (req, res) => {
    const { code } = req.query;
    const options = {
        code,
    };

    try {
        const result = await oauth2.getToken(options);
        req.session.accessToken = result.token.access_token;
        res.redirect('/');
    } catch (error) {
        console.error('Access Token Error', error.message);
        res.status(500).json('Authentication failed');
    }
});

apiRouter.get('/auth/status', (req, res) => {
    if (req.session.accessToken) {
        res.json({ loggedIn: true });
    } else {
        res.json({ loggedIn: false });
    }
});

apiRouter.post('/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out successfully' });
});

if (process.env.NODE_ENV === 'test') {
    apiRouter.get('/auth/test-login', (req, res) => {
        req.session.accessToken = 'test-token';
        res.status(200).send('OK');
    });
}


app.use('/api', apiRouter);

const startServer = async () => {
    try {
        await getTemplates(); // Wait for templates to be loaded
        return app.listen(port, () => {
            console.log(`Project service listening at http://localhost:${port}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Only start the server if this file is run directly
if (require.main === module) {
    startServer();
}

module.exports = { app, getTemplates };

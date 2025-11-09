const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const rateLimit = require('express-rate-limit');
const archiver = require('archiver');

const app = express();
const port = 8080;

app.use(express.json());

const apiRouter = express.Router();

const templatesDir = path.join(__dirname, '../../../templates');

// Rate limiter for project creation
const createProjectLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 create requests per windowMs
  message: { error: 'Too many projects created from this IP, please try again later.' },
});

// In-memory cache for templates
let templatesCache = null;

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
  const { name, template } = req.body;

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
    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level.
    });

    archive.on('warning', function(err) {
      if (err.code === 'ENOENT') {
        console.warn(err);
      } else {
        throw err;
      }
    });

    archive.on('error', function(err) {
      throw err;
    });

    res.attachment(`${sanitizedName}.zip`);
    archive.pipe(res);
    archive.directory(templatePath, false);
    await archive.finalize();

  } catch (error) {
    console.error(`Failed to create project '${name}':`, error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

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

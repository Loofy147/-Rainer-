const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = 3000;

app.use(express.json());

const templatesDir = path.join(__dirname, '../../../templates');
const projectsDir = path.join(__dirname, '../../../projects');


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

app.get('/templates', async (req, res) => {
  const templates = await getTemplates();
  res.json(templates);
});

app.post('/projects', async (req, res) => {
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

  const sanitizedName = path.basename(name);
  if (sanitizedName !== name) {
      return res.status(400).json({ error: 'Invalid project name. Path traversal characters are not allowed.' });
  }
  const projectPath = path.join(projectsDir, sanitizedName);

  try {
    await fs.mkdir(projectPath, { recursive: true });
    const templatePath = path.join(templatesDir, template);

    const copyRecursive = async (src, dest) => {
        const entries = await fs.readdir(src, { withFileTypes: true });
        await fs.mkdir(dest, { recursive: true });
        for (let entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                await copyRecursive(srcPath, destPath);
            } else {
                await fs.copyFile(srcPath, destPath);
            }
        }
    };

    await copyRecursive(templatePath, projectPath);

    console.log(`Creating project '${name}' from template '${template}'`);
    res.status(201).json({ message: `Project '${name}' created successfully from template '${template}'` });
  } catch (error) {
    console.error(`Failed to create project '${name}':`, error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

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

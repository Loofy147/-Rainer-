const express = require('express');
const app = express();
const port = 3000;

app.use(express.json());

app.post('/projects', (req, res) => {
  if (!req.body.name) {
    return res.status(400).json({ error: 'Project name is required' });
  }
  console.log('Creating project:', req.body.name);
  res.status(201).json({ message: `Project '${req.body.name}' created successfully` });
});

app.listen(port, () => {
  console.log(`Project service listening at http://localhost:${port}`);
});

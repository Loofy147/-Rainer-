const { expect } = require('chai');
const request = require('supertest');
const { app, getTemplates } = require('../index');
const fs = require('fs').promises;
const path = require('path');

const projectsDir = path.join(__dirname, '../../../../projects');


describe('Project Service API', () => {
    before(async () => {
        // Ensure templates are loaded before tests run
        await getTemplates();
    });

    describe('GET /templates', () => {
        it('should return a non-empty list of available templates', async () => {
            const res = await request(app).get('/templates');
            expect(res.status).to.equal(200);
            expect(res.body).to.be.an('array').that.is.not.empty;
            expect(res.body[0]).to.have.property('id');
            expect(res.body[0]).to.have.property('name');
            expect(res.body[0]).to.have.property('description');
        });
    });

    describe('POST /projects', () => {
        const projectName = 'test-project';
        const projectPath = path.join(projectsDir, projectName);

        afterEach(async () => {
            // Clean up created project
            try {
                await fs.rm(projectPath, { recursive: true, force: true });
            } catch (error) {
                // Ignore errors if the project was never created
                if (error.code !== 'ENOENT') {
                    throw error;
                }
            }
        });

        it('should create a new project from a template', async () => {
            const res = await request(app)
                .post('/projects')
                .send({ name: projectName, template: 'node-express-api' });

            expect(res.status).to.equal(201);
            const stats = await fs.stat(projectPath);
            expect(stats.isDirectory()).to.be.true;

            const packageJsonPath = path.join(projectPath, 'package.json');
            const packageJsonStats = await fs.stat(packageJsonPath);
            expect(packageJsonStats.isFile()).to.be.true;

            const ciYmlPath = path.join(projectPath, '.github/workflows/ci.yml');
            const ciYmlStats = await fs.stat(ciYmlPath);
            expect(ciYmlStats.isFile()).to.be.true;
        });

        it('should not allow path traversal in the project name', async () => {
            const maliciousName = '../../malicious-project';
            const res = await request(app)
                .post('/projects')
                .send({ name: maliciousName, template: 'node-express-api' });

            expect(res.status).to.equal(400);
            const maliciousPath = path.join(__dirname, '../../../malicious-project');

            try {
                await fs.access(maliciousPath);
                // If this doesn't throw, the test fails because the directory was created
                expect.fail('Malicious directory was created');
            } catch (error) {
                // We expect an ENOENT error, meaning the directory was not created
                expect(error.code).to.equal('ENOENT');
            }
        });

        it('should return a 400 error if name is missing', async () => {
            const res = await request(app)
                .post('/projects')
                .send({ template: 'node-express-api' });
            expect(res.status).to.equal(400);
        });

        it('should return a 400 error if template is missing', async () => {
            const res = await request(app)
                .post('/projects')
                .send({ name: projectName });
            expect(res.status).to.equal(400);
        });

        it('should return a 400 error if template is invalid', async () => {
            const res = await request(app)
                .post('/projects')
                .send({ name: projectName, template: 'invalid-template' });
            expect(res.status).to.equal(400);
        });
    });
});

const { expect } = require('chai');
const request = require('supertest');
const JSZip = require('jszip');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Project Service API', () => {
    let app;
    let getTemplates;

    beforeEach(async () => {
        const repos = {
            createForAuthenticatedUser: sinon.stub().resolves({
                data: {
                    html_url: 'https://github.com/test-user/test-repo',
                    owner: { login: 'test-user' },
                    default_branch: 'main',
                },
            }),
        };

        const git = {
            createBlob: sinon.stub().resolves({ data: { sha: 'test-blob-sha' } }),
            createTree: sinon.stub().resolves({ data: { sha: 'test-tree-sha' } }),
            createCommit: sinon.stub().resolves({ data: { sha: 'test-commit-sha' } }),
            updateRef: sinon.stub().resolves({}),
        };

        const octokitStub = sinon.stub().returns({ repos, git });

        const mockedApp = proxyquire('../index', {
            '@octokit/rest': {
                Octokit: octokitStub,
            },
        });
        app = mockedApp.app;
        getTemplates = mockedApp.getTemplates;
        await getTemplates();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('GET /templates', () => {
        it('should return a non-empty list of available templates', async () => {
            const res = await request(app).get('/api/templates');
            expect(res.status).to.equal(200);
            expect(res.body).to.be.an('array').that.is.not.empty;
            expect(res.body[0]).to.have.property('id');
            expect(res.body[0]).to.have.property('name');
            expect(res.body[0]).to.have.property('description');
        });
    });

    describe('POST /projects', () => {
        const projectName = 'test-project';
        const binaryParser = (res, callback) => {
            const chunks = [];
            res.on('data', (chunk) => {
                chunks.push(chunk);
            });
            res.on('end', () => {
                callback(null, Buffer.concat(chunks));
            });
        };

        it('should return a zip archive when a project is created', (done) => {
            request(app)
                .post('/api/projects')
                .send({ name: projectName, template: 'node-express-api' })
                .buffer()
                .parse(binaryParser)
                .end((err, res) => {
                    if (err) return done(err);
                    expect(res.status).to.equal(200);
                    expect(res.headers['content-type']).to.equal('application/zip');
                    expect(res.headers['content-disposition']).to.equal(`attachment; filename="${projectName}.zip"`);
                    expect(res.body).to.be.instanceOf(Buffer);
                    expect(res.body.length).to.be.greaterThan(0);
                    done();
                });
        });

        it('should return a zip with dynamically generated content', (done) => {
            request(app)
                .post('/api/projects')
                .send({
                    name: projectName,
                    template: 'node-express-api',
                    config: {
                        projectDescription: 'A custom description for the test project'
                    }
                })
                .buffer()
                .parse(binaryParser)
                .end(async (err, res) => {
                    if (err) return done(err);
                    try {
                        expect(res.status).to.equal(200);
                        const zip = await JSZip.loadAsync(res.body);
                        const packageJsonContent = await zip.file('package.json').async('string');
                        const packageJson = JSON.parse(packageJsonContent);

                        expect(packageJson.name).to.equal(projectName);
                        expect(packageJson.description).to.equal('A custom description for the test project');
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
        });

        it('should not allow path traversal in the project name', async () => {
            const res = await request(app)
                .post('/api/projects')
                .send({ name: '../../malicious-project', template: 'node-express-api' });

            expect(res.status).to.equal(400);
        });

        it('should return a 400 error if name is missing', async () => {
            const res = await request(app)
                .post('/api/projects')
                .send({ template: 'node-express-api' });
            expect(res.status).to.equal(400);
        });

        it('should return a 400 error if template is missing', async () => {
            const res = await request(app)
                .post('/api/projects')
                .send({ name: projectName });
            expect(res.status).to.equal(400);
        });

        it('should return a 400 error if template is invalid', async () => {
            const res = await request(app)
                .post('/api/projects')
                .send({ name: projectName, template: 'invalid-template' });
            expect(res.status).to.equal(400);
        });
    });

    describe('POST /repositories', () => {
        const projectName = 'test-repo';

        it('should create a new repository and return its URL', async () => {
            const res = await request(app)
                .post('/api/repositories')
                .send({
                    name: projectName,
                    template: 'node-express-api',
                    config: {
                        projectDescription: 'A custom description for the test project'
                    }
                });

            expect(res.status).to.equal(201);
            expect(res.body).to.have.property('url', 'https://github.com/test-user/test-repo');
        });
    });
});

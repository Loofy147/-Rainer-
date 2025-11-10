const { expect } = require('chai');
const request = require('supertest');
const JSZip = require('jszip');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const sodium = require('libsodium-wrappers');

before(async () => {
    await sodium.ready;
});

describe('Project Service API', () => {
    let app;
    let getTemplates;
    let actions;

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

        actions = {
            getRepoPublicKey: sinon.stub().resolves({ data: { key: 'i8b+iYd+1q/N45A+3jw4htQ/iVI+TRzIM0Hi3h9TbiA=', key_id: 'test-key-id' } }),
            createOrUpdateRepoSecret: sinon.stub().resolves({}),
            createWorkflowDispatch: sinon.stub().resolves({}),
            listWorkflowRuns: sinon.stub().resolves({ data: { workflow_runs: [] } }),
        };

        const octokitStub = sinon.stub().returns({ repos, git, actions });

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

    describe('Authenticated routes', () => {
        let agent;

        beforeEach((done) => {
            agent = request.agent(app);
            agent.get('/api/auth/test-login').end((err, res) => {
                expect(res.status).to.equal(200);
                done();
            });
        });

        describe('POST /repositories', () => {
            const projectName = 'test-repo';

            it('should return 401 if not authenticated', async () => {
                const res = await request(app)
                    .post('/api/repositories')
                    .send({
                        name: projectName,
                        template: 'node-express-api',
                        config: {
                            projectDescription: 'A custom description for the test project'
                        }
                    });

                expect(res.status).to.equal(401);
            });

            it('should create a new repository and return its URL if authenticated', async () => {
                const res = await agent
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

        describe('POST /repositories/:owner/:repo/secrets', () => {
            const owner = 'test-user';
            const repo = 'test-repo';

            it('should create secrets for the repository', async () => {
                const res = await agent
                    .post(`/api/repositories/${owner}/${repo}/secrets`)
                    .send({
                        secrets: [
                            { name: 'DOCKER_USERNAME', value: 'test-user' },
                            { name: 'DOCKER_PASSWORD', value: 'test-password' },
                        ],
                    });

                expect(res.status).to.equal(204);
                expect(actions.createOrUpdateRepoSecret.callCount).to.equal(2);
            });
        });

        describe('POST /repositories/:owner/:repo/dispatch', () => {
            const owner = 'test-user';
            const repo = 'test-repo';

            it('should dispatch a workflow for the repository', async () => {
                const res = await agent
                    .post(`/api/repositories/${owner}/${repo}/dispatch`)
                    .send({
                        workflow_id: 'ci.yml',
                    });

                expect(res.status).to.equal(204);
                expect(actions.createWorkflowDispatch.calledOnce).to.be.true;
            });
        });

        describe('GET /repositories/:owner/:repo/workflows/:workflow_id/status', () => {
            const owner = 'test-user';
            const repo = 'test-repo';
            const workflow_id = 'ci.yml';

            it('should return 401 if not authenticated', async () => {
                // Use a new, unauthenticated agent for this test
                const unauthenticatedAgent = request.agent(app);
                const res = await unauthenticatedAgent
                    .get(`/api/repositories/${owner}/${repo}/workflows/${workflow_id}/status`);

                expect(res.status).to.equal(401);
            });

            it('should return the status of the latest workflow run', async () => {
                actions.listWorkflowRuns.resolves({
                    data: {
                        workflow_runs: [
                            { status: 'in_progress', conclusion: null, created_at: '2025-01-03T00:00:00Z' },
                            { status: 'completed', conclusion: 'success', created_at: '2025-01-02T00:00:00Z' },
                        ],
                    },
                });

                const res = await agent
                    .get(`/api/repositories/${owner}/${repo}/workflows/${workflow_id}/status`);

                expect(res.status).to.equal(200);
                expect(res.body).to.deep.equal({ status: 'in_progress', conclusion: null });
            });

            it('should return a "not_found" status if no workflow runs exist', async () => {
                const res = await agent
                    .get(`/api/repositories/${owner}/${repo}/workflows/${workflow_id}/status`);

                expect(res.status).to.equal(200);
                expect(res.body).to.deep.equal({ status: 'not_found' });
            });
        });
    });
});

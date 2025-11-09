const { expect } = require('chai');
const request = require('supertest');
const { app, getTemplates } = require('../index');

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

        it('should return a zip archive when a project is created', (done) => {
            request(app)
                .post('/projects')
                .send({ name: projectName, template: 'node-express-api' })
                .buffer()
                .parse((res, callback) => {
                    res.data = '';
                    res.on('data', (chunk) => {
                        res.data += chunk;
                    });
                    res.on('end', () => {
                        callback(null, Buffer.from(res.data, 'binary'));
                    });
                })
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

        it('should not allow path traversal in the project name', async () => {
            const maliciousName = '../../malicious-project';
            const res = await request(app)
                .post('/projects')
                .send({ name: maliciousName, template: 'node-express-api' });

            expect(res.status).to.equal(400);
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

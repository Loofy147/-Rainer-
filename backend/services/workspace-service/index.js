const express = require('express');
const pino = require('pino');

const app = express();
const port = process.env.PORT || 3000;
const logger = pino();

app.use((req, res, next) => {
    logger.info({
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('user-agent'),
    }, 'Request received');
    next();
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.listen(port, () => {
    logger.info(`Server listening on port ${port}`);
});

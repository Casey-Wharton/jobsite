const express = require('express');
const router = express.Router();
const Airtable = require('airtable');
const puppeteer = require('puppeteer');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const sharp = require('sharp');
const path = require('path');

Airtable.configure({
    endpointUrl: 'https://api.airtable.com',
    apiKey: process.env.AIRTABLE_IMAGES_API_KEY
});

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
const FOLDER_NAME = 'tempimagestorage';
const base = Airtable.base('appUyBbwNArIavA4T');
const BOOKSETS_TABLE = 'tblNDvlPEnameiN89';
const COMBOS_TABLE = 'tblkLV7zuKdazLo5y';
const BOOKS_TABLE = 'tblNJJLPRs7ljU7sA';
const progressEmitter = new EventEmitter();
progressEmitter.setMaxListeners(50);

const comboBackgroundPath = path.join(__dirname, '..', 'imgs', 'Combo Image.png');
const highlightedBackgroundPath = path.join(__dirname, '..', 'imgs', 'Highlighted Combo Image.png');

async function createCompositeImage(booksetBuffer, backgroundPath) {
    const resizedBookset = await sharp(booksetBuffer)
        .resize(356, 357)
        .toBuffer();

    const finalImage = await sharp(backgroundPath)
        .composite([{ input: resizedBookset, left: 556, top: 81 }])
        .png()
        .toBuffer();

    return finalImage;
}

router.get('/', async (req, res) => {
    try {
        const booksets = [];
        const s3List = await s3.listObjectsV2({ Bucket: BUCKET_NAME, Prefix: FOLDER_NAME + '/' }).promise();
        const fileCount = (s3List.Contents || []).filter(obj => obj.Key !== FOLDER_NAME + '/').length;

        await base(BOOKSETS_TABLE).select({
            sort: [{ field: 'Book Set', direction: 'asc' }]
        }).eachPage((records, fetchNextPage) => {
            records.forEach(record => {
                booksets.push({ id: record.id, name: record.fields['Book Set'] || 'Untitled' });
            });
            fetchNextPage();
        });

        res.render('images/index', { booksets, fileCount });
    } catch (err) {
        console.error('Error fetching booksets:', err);
        res.status(500).send('Error loading booksets');
    }
});

router.post('/clear-s3-images', async (req, res) => {
    try {
        const list = await s3.listObjectsV2({ Bucket: BUCKET_NAME, Prefix: FOLDER_NAME + '/' }).promise();
        const contents = list.Contents || [];
        if (contents.length === 0) return res.json({ deleted: 0 });

        const objectsToDelete = contents
            .filter(obj => obj.Key !== FOLDER_NAME + '/')
            .map(obj => ({ Key: obj.Key }));

        await s3.deleteObjects({
            Bucket: BUCKET_NAME,
            Delete: { Objects: objectsToDelete }
        }).promise();

        res.json({ deleted: objectsToDelete.length });
    } catch (err) {
        console.error('Error clearing S3 folder:', err);
        res.status(500).json({ error: 'Failed to clear S3 folder' });
    }
});

router.get('/progress', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendProgress = (progress) => {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
    };

    progressEmitter.on('update', sendProgress);
    req.on('close', () => {
        progressEmitter.off('update', sendProgress);
    });
});

router.post('/generate-all', async (req, res) => {
    res.json({ started: true });

    try {
        const booksets = [];
        await base(BOOKSETS_TABLE).select({
            sort: [{ field: 'Book Set', direction: 'asc' }]
        }).eachPage((records, fetchNextPage) => {
            records.forEach(record => booksets.push(record));
            fetchNextPage();
        });

        const comboMap = {};
        await base(COMBOS_TABLE).select().eachPage((records, fetchNextPage) => {
            records.forEach(record => {
                const linkedBooksets = record.fields['Book Sets'];
                if (Array.isArray(linkedBooksets) && linkedBooksets.length > 0) {
                    linkedBooksets.forEach(booksetId => {
                        if (!comboMap[booksetId]) {
                            comboMap[booksetId] = [];
                        }
                        comboMap[booksetId].push(record.id);
                    });
                    
                }
            });
            fetchNextPage();
        });

        let completed = 0;

        for (const record of booksets) {
            const booksetId = record.id;
            const bookRefs = record.fields['Books'] || [];

            if (!bookRefs.length) {
                completed++;
                progressEmitter.emit('update', { progress: Math.round((completed / booksets.length) * 100) });
                continue;
            }

            const url = `http://localhost:3000/images/${booksetId}?screenshot=true`;

            let attempt = 0;
            const maxAttempts = 2;
            let success = false;

            while (attempt < maxAttempts && !success) {
                attempt++;
                try {
                    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
                    const page = await browser.newPage();
                    await page.goto(url, { waitUntil: 'networkidle0' });
                    await page.waitForSelector('.background-div', { visible: true });

                    await page.evaluate(() => {
                        return new Promise(resolve => {
                            const bgDiv = document.querySelector('.background-div');
                            const bgUrl = window.getComputedStyle(bgDiv).backgroundImage;
                            const urlMatch = bgUrl.match(/url\("?(.*?)"?\)/);
                            if (urlMatch && urlMatch[1]) {
                                const img = new Image();
                                img.src = urlMatch[1];
                                img.onload = resolve;
                                img.onerror = resolve;
                            } else {
                                resolve();
                            }
                        });
                    });

                    const element = await page.$('.background-div');
                    const buffer = await element.screenshot({ type: 'png' });
                    await browser.close();

                    const filename = `${FOLDER_NAME}/${booksetId}-${uuidv4()}.png`;
                    const uploadResult = await s3.upload({
                        Bucket: BUCKET_NAME,
                        Key: filename,
                        Body: buffer,
                        ContentType: 'image/png'
                    }).promise();

                    const publicUrl = uploadResult.Location;
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    await base(BOOKSETS_TABLE).update([{ id: booksetId, fields: { 'Bookset Image': [{ url: publicUrl }] } }]);

                    const comboIds = comboMap[booksetId] || [];
                    for (const comboId of comboIds) {
                        const comboImageBuffer = await createCompositeImage(buffer, comboBackgroundPath);
                        const highlightedImageBuffer = await createCompositeImage(buffer, highlightedBackgroundPath);

                        const comboUpload = await s3.upload({
                            Bucket: BUCKET_NAME,
                            Key: `${FOLDER_NAME}/${booksetId}-combo-${uuidv4()}.png`,
                            Body: comboImageBuffer,
                            ContentType: 'image/png'
                        }).promise();

                        const highlightedUpload = await s3.upload({
                            Bucket: BUCKET_NAME,
                            Key: `${FOLDER_NAME}/${booksetId}-highlighted-${uuidv4()}.png`,
                            Body: highlightedImageBuffer,
                            ContentType: 'image/png'
                        }).promise();

                        await base(COMBOS_TABLE).update([
                            {
                                id: comboId,
                                fields: {
                                    'Combo Image': [{ url: comboUpload.Location }],
                                    'Highlighted Combo Image': [{ url: highlightedUpload.Location }]
                                }
                            }
                        ]);
                    }

                    await new Promise(resolve => setTimeout(resolve, 1500));
                    await s3.deleteObject({ Bucket: BUCKET_NAME, Key: filename }).promise();
                    success = true;

                } catch (err) {
                    console.error(`Attempt ${attempt} failed for ${booksetId}:`, err);
                    if (attempt >= maxAttempts) console.warn(`Giving up on ${booksetId}`);
                }
            }

            completed++;
            progressEmitter.emit('update', { progress: Math.round((completed / booksets.length) * 100) });
        }

    } catch (err) {
        console.error('Error in batch generation:', err);
    }
});

router.get('/:id', async (req, res) => {
    const booksetId = req.params.id;
    try {
        const booksetRecord = await base(BOOKSETS_TABLE).find(booksetId);

        const bookRefs = booksetRecord.fields['Books'] || [];
        if (!bookRefs.length) {
            console.warn(`Bookset ${booksetId} has no books linked`);
            return res.status(404).send('Bookset has no books');
        }

        const books = [];
        for (const bookId of bookRefs) {
            try {
                const bookRecord = await base(BOOKS_TABLE).find(bookId);
                const image = (bookRecord.fields['2D Book Image'] || [])[0];
                if (image && image.url) books.push({ coverImage: image.url });
            } catch (err) {
                console.warn(`Error loading book ${bookId} for bookset ${booksetId}:`, err);
            }
        }

        const totalBooks = books.length;
        const columns = Math.ceil(Math.sqrt(totalBooks));
        const rows = Math.ceil(totalBooks / columns);
        const completeRow = ((columns * rows) !== totalBooks) ? (columns * rows) - columns : 0;

        res.render('images/show', {
            isScreenshot: req.query.screenshot === 'true',
            bookset: { name: booksetRecord.fields['Book Set'] },
            books,
            totalBooks,
            completeRow,
            columns
        });
    } catch (err) {
        console.error(`Error loading bookset image view for ${booksetId}:`, err);
        res.status(500).send('Error loading bookset image view');
    }
});

router.post('/:id/snapshot', async (req, res) => {
    const booksetId = req.params.id;
    const url = `http://localhost:3000/images/${booksetId}?screenshot=true`;

    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle0' });
        await page.waitForSelector('.background-div', { visible: true });

        await page.evaluate(() => {
            return new Promise(resolve => {
                const bgDiv = document.querySelector('.background-div');
                const bgUrl = window.getComputedStyle(bgDiv).backgroundImage;
                const urlMatch = bgUrl.match(/url\("?(.*?)"?\)/);
                if (urlMatch && urlMatch[1]) {
                    const img = new Image();
                    img.src = urlMatch[1];
                    img.onload = resolve;
                    img.onerror = resolve;
                } else {
                    resolve();
                }
            });
        });

        const element = await page.$('.background-div');
        const buffer = await element.screenshot({ type: 'png' });
        await browser.close();

        const filename = `${FOLDER_NAME}/${booksetId}-${uuidv4()}.png`;
        const uploadResult = await s3.upload({
            Bucket: BUCKET_NAME,
            Key: filename,
            Body: buffer,
            ContentType: 'image/png'
        }).promise();

        const publicUrl = uploadResult.Location;

        await base(BOOKSETS_TABLE).update([{ id: booksetId, fields: { 'Bookset Image': [{ url: publicUrl }] } }]);
        await new Promise(resolve => setTimeout(resolve, 1000));

// 🔁 Load comboMap (proper array version)
const comboMap = {};
const comboRecords = await base(COMBOS_TABLE).select().firstPage();
comboRecords.forEach(record => {
    const linked = record.fields['Book Sets'];
    if (Array.isArray(linked)) {
        linked.forEach(booksetId => {
            if (!comboMap[booksetId]) {
                comboMap[booksetId] = [];
            }
            comboMap[booksetId].push(record.id);
        });
    }
});

const comboIds = comboMap[booksetId] || [];
if (comboIds.length > 0) {
    const comboImageBuffer = await createCompositeImage(buffer, comboBackgroundPath);
    const highlightedImageBuffer = await createCompositeImage(buffer, highlightedBackgroundPath);

    const comboUpload = await s3.upload({
        Bucket: BUCKET_NAME,
        Key: `${FOLDER_NAME}/${booksetId}-combo-${uuidv4()}.png`,
        Body: comboImageBuffer,
        ContentType: 'image/png'
    }).promise();

    const highlightedUpload = await s3.upload({
        Bucket: BUCKET_NAME,
        Key: `${FOLDER_NAME}/${booksetId}-highlighted-${uuidv4()}.png`,
        Body: highlightedImageBuffer,
        ContentType: 'image/png'
    }).promise();

    for (const comboId of comboIds) {
        await base(COMBOS_TABLE).update([
            {
                id: comboId,
                fields: {
                    'Combo Image': [{ url: comboUpload.Location }],
                    'Highlighted Combo Image': [{ url: highlightedUpload.Location }]
                }
            }
        ]);
    }
}
        await new Promise(resolve => setTimeout(resolve, 1500));
        await s3.deleteObject({ Bucket: BUCKET_NAME, Key: filename }).promise();

        res.json({ success: true });
    } catch (err) {
        console.error('Snapshot error:', err);
        res.status(500).json({ success: false });
    }
});

module.exports = router;
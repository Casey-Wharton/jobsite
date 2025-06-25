// Updated generatePresentation.js with info slide injection
const mysql = require('mysql2/promise');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const os = require('os');

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

const BASE_S3_URL = 'https://s3.amazonaws.com/contractorcourses.com';
const BUCKET_NAME = 'contractorcourses.com';
const FOLDER = '00_autopresentations';

async function generatePresentation(bookId) {
    const connection = await mysql.createConnection({
        host: '3.229.7.141',
        user: 'forge',
        password: 'qIJOndUTc6s6jtwIqXSQ',
        database: 'CONTRACTORS_DB_PRD'
    });

    try {
        const [bookRows] = await connection.execute(
            'SELECT name, folder_name, book_img_url FROM books WHERE id = ?',
            [bookId]
        );

        if (bookRows.length === 0) throw new Error('Book not found');

        const { name: bookName, folder_name: folderName, book_img_url: bookImgFilename } = bookRows[0];
        const coverImage = bookImgFilename ? `${BASE_S3_URL}/${folderName}/${bookImgFilename}` : null;

        const [slideRows] = await connection.execute(
            `SELECT q.id AS question_id, q.statement_text, q.statement_audio, bq.hint, bq.hint_image AS image_filename, bq.sort AS sort_order
             FROM questions q
             INNER JOIN book_question bq ON q.id = bq.question_id
             WHERE bq.book_id = ? AND q.deleted_at IS NULL
             ORDER BY bq.sort ASC`,
            [bookId]
        );

        const highlightKey = `${FOLDER}/${bookId}/${bookId}_highlights.json`;
        const highlightData = await s3.getObject({ Bucket: BUCKET_NAME, Key: highlightKey }).promise();
        const highlightJson = JSON.parse(highlightData.Body.toString('utf-8'));

        const pageMap = {};
        for (const q of slideRows) {
            const highlightEntry = highlightJson[q.question_id];
            if (!highlightEntry) continue;
            const page = highlightEntry.page;
            if (!pageMap[page]) pageMap[page] = [];
            pageMap[page].push({ ...q, highlightRects: highlightEntry.highlights });
        }

        const contentSlides = [];
        for (const [page, questions] of Object.entries(pageMap)) {
            const first = questions[0];
            const isCombined = questions.length > 1;
            contentSlides.push({
                type: isCombined ? 'combined' : 'single',
                page: parseInt(page),
                text: isCombined ? questions.map(q => q.statement_text) : questions[0].statement_text,
                hint: first.hint,
                hints: isCombined ? questions.map(q => q.hint) : undefined,
                image: `${BASE_S3_URL}/${folderName}/${first.image_filename}`,
                audio: questions
                    .map(q => q.statement_audio)
                    .filter(a => !!a)
                    .map(a => `${BASE_S3_URL}/${a}`),
                highlights: questions.flatMap(q => (q.highlightRects || []).map(h => ({
                    ...h,
                    originalWidth: 1068,
                    originalHeight: 707
                })))
            });
        }

        let productUrl = '';
        try {
            const existingData = await s3.getObject({
                Bucket: BUCKET_NAME,
                Key: `${FOLDER}/${bookId}/${bookId}_slide_info.json`
            }).promise();
            const existingJson = JSON.parse(existingData.Body.toString('utf-8'));
            if (existingJson.productUrl) productUrl = existingJson.productUrl;
        } catch (e) {
            console.warn(`No previous JSON or productUrl: ${e.message}`);
        }

        const titleSlide = {
            type: 'title',
            text: 'Highlighting Guide',
            image: `${BASE_S3_URL}/${FOLDER}/${bookId}/${bookId}_book_cover.png`,
            ...(productUrl ? { productUrl } : {})
        };

        const infoSlideKey = `${FOLDER}/${bookId}/info_slide_resources/${bookId}_info_slides.json`;
        let beginningSlides = [], endingSlides = [];

        try {
            const infoSlideData = await s3.getObject({ Bucket: BUCKET_NAME, Key: infoSlideKey }).promise();
            const parsed = JSON.parse(infoSlideData.Body.toString('utf-8'));

            beginningSlides = parsed.beginning.map(slide => ({
                type: 'info',
                text: slide.text,
                image: slide.imageUrl || '',
                audio: slide.audioUrl ? [slide.audioUrl] : []
            }));

            endingSlides = parsed.ending.map(slide => ({
                type: 'info',
                text: slide.text,
                image: slide.imageUrl || '',
                audio: slide.audioUrl ? [slide.audioUrl] : []
            }));
        } catch (e) {
            console.warn(`No info slides JSON found: ${e.message}`);
        }

        const outputData = {
            bookName,
            coverImage,
            slides: [titleSlide, ...beginningSlides, ...contentSlides, ...endingSlides],
            ...(productUrl ? { productUrl } : {})
        };

        const filename = `${bookId}_slide_info.json`;
        const tempFilePath = path.join(os.tmpdir(), filename);
        fs.writeFileSync(tempFilePath, JSON.stringify(outputData, null, 2));

        await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: `${FOLDER}/${bookId}/${filename}`,
            Body: fs.readFileSync(tempFilePath),
            ContentType: 'application/json',
            ACL: 'public-read'
        }).promise();

        fs.unlinkSync(tempFilePath);
        await connection.end();
        return true;
    } catch (err) {
        await connection.end();
        throw err;
    }
}

module.exports = generatePresentation;
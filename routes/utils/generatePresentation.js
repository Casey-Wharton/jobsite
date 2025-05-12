const mysql = require('mysql2/promise');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp'); // for image composition
const { createCanvas, loadImage } = require('canvas'); // required for local PDF page rendering, if needed

// Configure AWS
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

const BASE_S3_URL = 'https://s3.amazonaws.com/contractorcourses.com';
const BUCKET_NAME = 'contractorcourses.com';
const FOLDER = '00_autopresentations';
const TITLE_IMAGE_PREFIX = `${BASE_S3_URL}/${FOLDER}/3dbooks`;


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

        if (bookRows.length === 0) {
            throw new Error('Book not found');
        }

        const { name: bookName, folder_name: folderName, book_img_url: bookImgFilename } = bookRows[0];
        const coverImage = bookImgFilename ? `${BASE_S3_URL}/${folderName}/${bookImgFilename}` : null;

        const [slideRows] = await connection.execute(`
            SELECT 
                q.id AS question_id,
                q.statement_text,
                q.statement_audio,
                bq.hint,
                bq.hint_image AS image_filename,
                bq.sort AS sort_order
            FROM questions q
            INNER JOIN book_question bq ON q.id = bq.question_id
            WHERE bq.book_id = ? AND q.deleted_at IS NULL
            ORDER BY bq.sort ASC
        `, [bookId]);
        
        const slides = slideRows
            .filter(slide => slide.image_filename && slide.image_filename.trim() !== '')
            .map(slide => ({
                text: slide.statement_text,
                hint: slide.hint,
                image: `${BASE_S3_URL}/${folderName}/${slide.image_filename}`,
                audio: slide.statement_audio ? `${BASE_S3_URL}/${slide.statement_audio}` : null
            }));
        
// Check for existing productUrl in top-level JSON
let productUrl = '';
try {
  const existingData = await s3.getObject({
    Bucket: BUCKET_NAME,
    Key: `${FOLDER}/${bookId}/book_${bookId}_slides.json`,
  }).promise();

  const existingJson = JSON.parse(existingData.Body.toString('utf-8'));
  if (existingJson.productUrl) {
    productUrl = existingJson.productUrl;
  }
} catch (e) {
  console.warn(`No previous JSON found or couldn't read productUrl: ${e.message}`);
}


const titleSlide = {
    type: 'title',
    text: 'Highlighting Guide',
    image: `${TITLE_IMAGE_PREFIX}/title_${bookId}.png`,
    ...(productUrl ? { productUrl } : {})
  };
  
  const finalSlides = [titleSlide, ...slides];

  const outputData = {
    bookName,
    coverImage,
    slides: finalSlides,
    ...(productUrl ? { productUrl } : {})
};
  
        const filename = `book_${bookId}_slides.json`;
        const tempFilePath = path.join(os.tmpdir(), filename);
        fs.writeFileSync(tempFilePath, JSON.stringify(outputData, null, 2));

        const fileContent = fs.readFileSync(tempFilePath);
        await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: `${FOLDER}/${bookId}/${filename}`,
            Body: fileContent,
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
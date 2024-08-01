if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}
const AWS = require('aws-sdk')
const s3 = new AWS.S3

const s3Uploadv2 = async (files) => {
    let filesArray = new Array();
    if(files.twoDImage) {
        filesArray[0] = files.twoDImage[0]
    } 
    if(files.bookPDF) {
        filesArray[1] = files.bookPDF[0]
    }    
    const params = filesArray.map(file => {
        randomNumber = Math.floor(100000 + Math.random() * 900000) + file.originalname
        if(file.fieldname === 'bookPDF') {
            return {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `bookfiles/bookpdfs/${randomNumber}`,
            ContentType: 'application/pdf',
            Body: file.buffer
            } 
          } else {
            return {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `bookfiles/bookimages/${randomNumber}`,
                ContentType: 'image/png',
                Body: file.buffer
                } 
        }
    })
    return await Promise.all(params.map(param => s3.upload(param).promise()))
}
module.exports = s3Uploadv2
'use strict';

const https = require('https');
const fs = require('fs');
const aws = require('aws-sdk');
const qs = require('querystring');
const s3 = new aws.S3();

const uploadToBucket = function(filename) {
    var bodystream = fs.createReadStream(process.env.TEMP_FOLDER + filename);
    
    return new Promise((resolve, reject) => {
        s3.putObject({
           Bucket: process.env.UPLOAD_BUCKET,
           Key: filename,
           Body: bodystream
        }, function(error, data){
           if (error){
            return reject(error);
           } 
           return resolve();
        });
    });
};

const downloadFileToSystem = function(path, filename) {
    var file = fs.createWriteStream(process.env.TEMP_FOLDER + filename);

    const options = {
        hostname: process.env.SLACK_HOSTNAME,
        path: path,
        headers: {
            authorization: 'Bearer ' + process.env.BOT_ACCESS_TOKEN
        }
    };

    return new Promise((resolve, reject) => {
        const request = https.get(options, (response) => {

            if (response.statusCode < 200 || response.statusCode > 299) {
                reject(new Error('Failure downloading file: ' + response.statusCode));
            }

            response.pipe(file);

            file.on('finish', function() {
                file.close(() => resolve());
            });
        });

        request.on('error', (err) => reject(err))
    })
};

const updateStatusInSlack = function(filename, channel) {
  return new Promise((resolve, reject) => {
  
    const response = {
        token: process.env.BOT_ACCESS_TOKEN,
        channel: channel,
        text: 'I am working on ' + filename + '... should be done soon.'
      }

      const URL = process.env.POST_MESSAGE_URL + qs.stringify(response);

      https.get(URL, (res) => {
        const statusCode = res.statusCode;
        resolve();
      }) 
  });
}

module.exports.endpoint = (event, context, callback) => {
  const request = JSON.parse(event.body);

  if (request.event.type && request.event.type === 'message' && 
      request.event.subtype && request.event.subtype === 'file_share') {

    const path = request.event.file.url_private_download;
    const filename = request.event.file.name;
    const channel = request.event.channel;

    downloadFileToSystem(path, filename)
      .then(() => uploadToBucket(filename))
      .then(() => updateStatusInSlack(filename, channel))
      .then(() => callback(null, {statusCode: 200}))
      .catch(() => callback(null, {statusCode: 500}));

      return;
  }

  callback(null, {statusCode: 200});
};

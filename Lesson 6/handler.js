'use strict';

const https = require('https');
const fs = require('fs');
const aws = require('aws-sdk');
const qs = require('querystring');
const exec = require('child_process').exec;

const s3 = new aws.S3();
const db = new aws.DynamoDB();

const getBotAccessToken = function(team) {
    return new Promise((resolve, reject) => {
        var params = {
            TableName: process.env.TEAMS_TABLE,
            Key: {
                "team_id": {
                    S: team
                }
            }
        };

        db.getItem(params, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data.Item.bot.M.bot_access_token.S);
            }
        });
    });
};

const downloadFileToSystem = function(accessToken, path, filename) {
    var file = fs.createWriteStream(process.env.TEMP_FOLDER + filename);
    const options = {
        hostname: process.env.SLACK_HOSTNAME,
        path: path,
        headers: {
            authorization: 'Bearer ' + accessToken
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
        request.on('error', (err) => reject(err));
    });
};

const uploadToBucket = function(filename) {
    var bodystream = fs.createReadStream(process.env.TEMP_FOLDER + filename);
    
    return new Promise((resolve, reject) => {
        s3.putObject({
            Bucket: process.env.UPLOAD_BUCKET,
            Key: filename,
            Body: bodystream
        }, function(error, data) {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
};

const updateStatusInSlack = function(accessToken, filename, channel) {
    return new Promise((resolve, reject) => {
        const response = {
            token: accessToken,
            channel: channel,
            text: 'I am working on ' + filename + '... should be done soon.'
        };
        
        const URL = process.env.POST_MESSAGE_URL + qs.stringify(response);
        https.get(URL, (res) => {
            resolve();
        })
    });
};

module.exports.endpoint = (event, context, callback) => {
    const request = JSON.parse(event.body);
    
    if (request.event.type && request.event.type === 'message' 
    && request.event.subtype && request.event.subtype === 'file_share') {
            
            const path = request.event.file.url_private_download;
            const filename = request.event.file.name;
            const channel = request.event.channel;
            var accessToken = '';
            
            getBotAccessToken(request.team_id)
                .then((token) => {accessToken = token; return downloadFileToSystem(accessToken, path, filename);})
                .then(() => uploadToBucket(filename))
                .then(() => updateStatusInSlack(accessToken, filename, channel))
                .then(() => callback(null, {statusCode: 200}))
                .catch(() => callback(null, {statusCode: 500}));
            
        return;
    }

    callback(null, {
        statusCode: 200
    });
};
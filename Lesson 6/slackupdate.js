'use strict';

const aws = require('aws-sdk');
const https = require('https');
const qs = require('querystring');
const request = require('request');
const s3 = new aws.S3();

const getSignedUrl = function (bucket, key) {
    console.log('Getting signed url for bucket');

    return new Promise((resolve, reject) => {
        const params = {
            Bucket: bucket,
            Key: key,
            Expires: 604800
        };
        const url = s3.getSignedUrl('getObject', params);
        console.log(url);
        resolve(url);
    });
};

const getShortUrl = function (url) {
    console.log('Getting short url');

    return new Promise((resolve, reject) => {
        const req = {
            uri: process.env.SHORTENER_API_URL + qs.stringify({
                key: process.env.SHORTENER_API_KEY
            }),
            method: 'POST',
            json: true,
            body: {
                longUrl: url
            }
        }

        request(req, (err, res, body) => {
            if (err && res.statusCode !== 200) {
                reject(err);
            } else {
                resolve(body.id);
            }
        });
    });
}

const writeToSlack = function (url) {
    console.log('Posting image back to slack');

    return new Promise((resolve, reject) => {
        const slackParams = {
            token: process.env.BOT_ACCESS_TOKEN,
            channel: process.env.CHANNEL_ID,
            text: url
        }

        const slackurl = process.env.POST_MESSAGE_URL + qs.stringify(slackParams);

        https.get(slackurl, (res) => {
            const statusCode = res.statusCode;
            resolve();
        })
    });
}

module.exports.execute = (event, context, callback) => {
    const bucket = event.Records[0].s3.bucket.name;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));

    getSignedUrl(bucket, key)
        .then((url) => getShortUrl(url))
        .then((url) => writeToSlack(url))
        .then(() => {
            console.log('Finished processing image');
            callback(null);
        })
        .catch((err) => {
            console.log(err);
            callback(err);
        });
};
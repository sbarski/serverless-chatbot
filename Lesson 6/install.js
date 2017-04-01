'use strict';

const aws = require('aws-sdk');
const qs = require('querystring');
const request = require('request');

const db = new aws.DynamoDB.DocumentClient();

const extractCode = function(event) {
    return new Promise((resolve, reject) => {
        if (event.queryStringParameters && event.queryStringParameters.code) {
            return resolve(event.queryStringParameters.code);
        }

        reject('Code not provided');
    });
};

const getOAuthToken = function(code) {
    return new Promise((resolve, reject) => {
        if (code === null) { return reject('Could not provided'); }

        const params = {
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            code
        }

        var url = process.env.SLACK_OAUTH + qs.stringify(params);

        request.get(url, (err, res, body) => {
            if (err || res.statusCode !== 200) {
                reject(err);
            } else {
                resolve(body);
            }
        })
    });
};

const saveToDynamo = function(response) {
    return new Promise((resolve, reject) => {
        const params = {
            TableName: process.env.TABLE_NAME,
            Item: JSON.parse(response)
        }

        db.put(params, (err, data) =>{
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        })
    });
}

const successResponse = function() {
    return {
        statusCode: 200
    }
}

const errorResponse = function() {
    return {
        statusCode: 302
    }
}

module.exports.endpoint = (event, context, callback) => {
    extractCode(event)
        .then((code) => getOAuthToken(code))
        .then((response) => saveToDynamo(response))
        .then(() => callback(null, successResponse()))
        .catch((err) => callback(null, errorResponse()))
};

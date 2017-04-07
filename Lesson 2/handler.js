'use strict';

const https = require('https');
const qs = require('querystring');

const direct_mention = new RegExp('^\<\@' + process.env.BOT_ID + '\>', 'i');

module.exports.endpoint = (event, context, callback) => {
  const request = JSON.parse(event.body);

  if (request.type === 'url_verification' && 
      request.token === process.env.VERIFICATION_TOKEN) {

      const response = {
        statusCode: 200,
        body: JSON.stringify({
          'challenge' : request.challenge
        })
      }

      return callback(null, response);
  }

  if (request.event.text.match(direct_mention)) {

    const response = {
      token: process.env.BOT_ACCESS_TOKEN,
      channel: request.event.channel,
      text: request.event.text.replace(direct_mention, '') + ' [' + Date.now() + ']'
    }

    const URL = process.env.POST_MESSAGE_URL + qs.stringify(response);

    https.get(URL, (res) => {
      const statusCode = res.statusCode;

      console.log(direct_mention, request.event.text.replace(direct_mention, ''), statusCode);

      if (statusCode !== 200) {
        console.log(res);
      } 

      callback(null, {statusCode: 200});
    }) 
  } else {
    // if Slack does not receive an HTTP 2xx within 3 seconds, it will retry 3 times using
    // exponential backoff, so just return a 200 if the bot was not directly mentioned
      callback(null, {statusCode: 200});
  }
};

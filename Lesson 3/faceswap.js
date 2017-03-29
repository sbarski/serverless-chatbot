'use strict';

const aws = require('aws-sdk');
const fs = require('fs');

const gm = require('gm').subClass({
    imageMagick: true
});

const rekognition = new aws.Rekognition();
const s3 = new aws.S3();

function getEmojiBasedOnSentiment(emotion) {
  console.log(emotion);
  if (emotion) {
    return 'emoji/' + emotion[0].Type.toLowerCase() + '.png';
  } else {
    return 'emoji/happy.png';
  }
}

const detectFaces = function(bucket, filename) {
  return new Promise((resolve, reject) => {
    var params = {
        Image: {
        S3Object: {
          Bucket: bucket,
          Name: filename
        }
      },
      Attributes: ['ALL']
      };

    rekognition.detectFaces(params, function(err, data) {
       if (err) {
        reject(err); // an error occurred
       }
       else {
        resolve(data);        // successful response
       }     
    })
  });
}

const saveFileToSystem = function(bucket, key, facedata) {
    var file = fs.createWriteStream(process.env.TEMP_FOLDER + key);
    
    return new Promise((resolve, reject) => {
        var stream = s3.getObject({Bucket: bucket, Key: key})
                       .createReadStream()
                       .pipe(file);                            

        stream.on('error', function(error){
            reject(error);
        });

        stream.on('close', function(data){
            resolve();
        });
    });
};

const getImage = function(key) {
  return new Promise((resolve, reject) => {
    resolve(gm(process.env.TEMP_FOLDER + key));
  });
}

const getImageSize = function(image) {
  return new Promise((resolve, reject) => {
    image.size(function(err, size) {
          resolve(size);
      });
  });
}

const processFaces = function(key, image, size, facedata) {
  return new Promise((resolve, reject) => {

      for (var i = 0; i < facedata.FaceDetails.length; i++) {
        var box = facedata.FaceDetails[i].BoundingBox;

        const left = parseInt(box.Left * size.width, 10);
        const top = parseInt(box.Top * size.height, 10);

        const width = parseInt(size.width * box.Width, 10);
        const height = parseInt(size.height * box.Height, 10);

        var dimensions = `${left}` + ',' + `${top}` + ' ' + `${width}` + ',' + `${height}`;
        var emoji = getEmojiBasedOnSentiment(facedata.FaceDetails[i].Emotions);
        image.draw('image Over ' + dimensions + ' ' + emoji);
      }

      resolve(image);
  });
}

const saveToLocalStorage = function(image, key) {
  return new Promise((resolve, reject) => {
     image.write(process.env.TEMP_FOLDER + process.env.OUTPUT_PREFIX + key, function (error){
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
  });
}

const uploadToBucket = function(key) {
    var bodystream = fs.createReadStream(process.env.TEMP_FOLDER + process.env.OUTPUT_PREFIX + key);
    
    console.log('upload to bucket');
    
    return new Promise((resolve, reject) => {
        s3.putObject({
           Bucket: process.env.TRANSFORM_BUCKET,
           Key: key,
           Body: bodystream
        }, function(error, data){
           if (error){
            return reject(error);
           } 
           return resolve();
        });
    });
};

module.exports.execute = (event, context, callback) => {  
  const bucket = event.Records[0].s3.bucket.name;
  const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
    
  var fd = null;
  var img = null;

  detectFaces(bucket, key)
    .then((facedata) => {fd = facedata; return saveFileToSystem(bucket, key, facedata)})
    .then(() => getImage(key))
    .then((image) => {img = image; return getImageSize(image);})
    .then((size) => processFaces(key, img, size, fd))
    .then((n) => saveToLocalStorage(n, key))
    .then(() => uploadToBucket(key))
    .then(() => callback(null, 'Success'))
    .catch((err) => callback(err))
};

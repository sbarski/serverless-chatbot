'use strict';

const aws = require('aws-sdk');
const fs = require('fs');

const gm = require('gm').subClass({
    imageMagick: true
});

const rekognition = new aws.Rekognition();
const s3 = new aws.S3();

function getEmojiBasedOnSentiment(emotion) {
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
        reject(err); 
       }
       else {
        resolve(data);
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

const analyseImage = function(key) {
  return new Promise((resolve, reject) => {
    var image = gm(process.env.TEMP_FOLDER + key);

    image.size(function(err, size) {
        if (err) {
          reject(err);
        }
        else {
          resolve({image: image, size: size});
        }
      });
  });
}

const processFaces = function(key, imgdata, facedata) {
  const image = imgdata.image;
  const size = imgdata.size;

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

const saveNewImageToSystem = function(image, key) {
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
    
    return new Promise((resolve, reject) => {
        s3.putObject({
           Bucket: process.env.TRANSFORM_BUCKET,
           Key: key,
           Body: bodystream
        }, function(error, data){
           if (error){
            reject(error);
           } else {
            resolve();
           } 
        });
    });
};

module.exports.execute = (event, context, callback) => {  
  const bucket = event.Records[0].s3.bucket.name;
  const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
    
  var fd = null;

  detectFaces(bucket, key)
    .then((facedata) => {fd = facedata; return saveFileToSystem(bucket, key, facedata)})
    .then(() => analyseImage(key))
    .then((imagedata) => processFaces(key, imagedata, fd))
    .then((image) => saveNewImageToSystem(image, key))
    .then(() => uploadToBucket(key))
    .then(() => callback(null, 'Success'))
    .catch((err) => callback(err))
};
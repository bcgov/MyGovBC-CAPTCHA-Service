/*jshint node:true, esversion: 6 */
'use strict';

var bodyParser = require('body-parser');
var jose = require('node-jose');
var Buffer = require('buffer').Buffer;
var app = require('express')();
var jwt = require('jsonwebtoken');
var svgCaptcha = require('svg-captcha');
var winston = require('winston');

// requires for audio support
var lame = require('lame');
var wav = require('wav');
var meSpeak = require("mespeak");
var streamifier = require("streamifier");
var os = require("os");
var arrayBufferToBuffer = require('arraybuffer-to-buffer');

var LISTEN_IP = process.env.LISTEN_IP || '0.0.0.0';
var HOSTNAME = require('os').hostname();
var CAPTCHA_SIGN_EXPIRY = process.env.CAPTCHA_SIGN_EXPIRY || "15"; // In minutes
var JWT_SIGN_EXPIRY = process.env.JWT_SIGN_EXPIRY || "15"; // In minutes
var SECRET = process.env.SECRET || "defaultSecret";
var PRIVATE_KEY = process.env.PRIVATE_KEY ? JSON.parse(process.env.PRIVATE_KEY)
  : {
    kty: 'oct',
    kid: 'gBdaS-G8RLax2qObTD94w',
    use: 'enc',
    alg: 'A256GCM',
    k: 'FK3d8WvSRdxlUHs4Fs_xxYO3-6dCiUarBwiYNFw5hv8'
  };
var LOG_LEVEL = process.env.LOG_LEVEL || "debug";
var SERVICE_PORT = process.env.SERVICE_PORT || 3000;
var WINSTON_HOST = process.env.WINSTON_HOST;
var WINSTON_PORT = process.env.WINSTON_PORT;
var AUDIO_ENABLED = process.env.AUDIO_ENABLED || "true";

// Prevent default keys going into production
if (process.env.NODE_ENV == 'production') {
  if (SECRET == 'defaultSecret' ||
    PRIVATE_KEY.kid == 'gBdaS-G8RLax2qObTD94w') {

    winston.info("You MUST change SECRET and PRIVATE_KEY before running in a production environment.");
    process.exit(1);
  }
}

if (process.env.NODE_ENV != 'production' ||
  process.env.CORS_ALLOW_ALL == 'true') {
  app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });
}


////////////////////////////////////////////////////////
/*
 * Logger init
 */
////////////////////////////////////////////////////////
winston.level = LOG_LEVEL;
winston.remove(winston.transports.Console);
winston.add(winston.transports.Console, {'timestamp': true});
if (process.env.WINSTON_PORT) {
  winston.add(winston.transports.Syslog, {
    host: WINSTON_HOST,
    port: WINSTON_PORT,
    protocol: 'udp4',
    localhost: HOSTNAME
  });
}

////////////////////////////////////////////////////////
/*
 * App Startup
 */
////////////////////////////////////////////////////////

// Init audio settings
meSpeak.loadConfig(require("mespeak/src/mespeak_config.json"));
meSpeak.loadVoice(require("mespeak/voices/en/en-us.json"));

// create the Encoder instance
var encoder = new lame.Encoder({
  // input
  channels: 1,        // 1 channels
  bitDepth: 16,       // 16-bit samples
  sampleRate: 44100,  // 44,100 Hz sample rate

  // output
  bitRate: 128,
  outSampleRate: 22050,
  mode: lame.MONO // STEREO (default), JOINTSTEREO, DUALCHANNEL or MONO
});

// init app
app.use(bodyParser.json());

var args = process.argv;
if (args.length == 3 && args[2] == 'server') {
  var server = app.listen(SERVICE_PORT, LISTEN_IP, function () {
    var host = server.address().address;
    var port = server.address().port;
    winston.info(`MyGov Captcha Service listening at http://${host}:${port}`);
    winston.info(`Log level is at: ${LOG_LEVEL}`);
  });
}

////////////////////////////////////////////////////////
/*
 * Encryption Routines
 */
////////////////////////////////////////////////////////
function decrypt(body, private_key) {
  winston.debug(`to decrypt body: ` + JSON.stringify(body));
  return new Promise(function (resolve, reject) {
    try {
      jose.JWK.asKey(private_key, "json")
        .then(function (res) {
          jose.JWE.createDecrypt(res)
            .decrypt(body)
            .then(function (decrypted) {
              var decryptedObject = JSON.parse(decrypted.plaintext.toString('utf8'));
              winston.debug('decrypted object: ' + JSON.stringify(decryptedObject));
              resolve(decryptedObject);
            });
        });
    } catch (e) {
      winston.error(`err: ` + JSON.stringify(e));
      reject(e);
    }
  });
}
function encrypt(body) {
  winston.debug(`encrypt: ` + JSON.stringify(body));
  return new Promise(function (resolve, reject) {

    var buff = new Buffer(JSON.stringify(body));
    try {
      jose.JWE.createEncrypt(PRIVATE_KEY)
        .update(buff)
        .final()
        .then(function (cr) {
          winston.debug(`encrypted: ` + JSON.stringify(cr));
          resolve(cr);
        }, function (e) {
          winston.error(`err: ` + JSON.stringify(e));
          reject(e);
        });
    } catch (e) {
      winston.error(`err: ` + JSON.stringify(e));
      reject(e);
    }
  });
}

////////////////////////////////////////////////////////
/*
 * Get a new captcha
 */
////////////////////////////////////////////////////////
var getCaptcha = function (payload) {
  winston.debug(`getCaptcha: ${payload.nonce}`);

  return new Promise(function (resolve, reject) {
    var captcha = svgCaptcha.create({
      size: 6, // size of random string
      ignoreChars: '0o1il', // filter out some characters like 0o1i
      noise: 2 // number of lines to insert for noise
    });
    if (!captcha || (captcha && !captcha.data)) {
      // Something bad happened with Captcha.
      resolve({valid: false});
    }
    winston.debug(`captcha generated: ${captcha.text}`);

    // prep captcha string for good reading by putting spaces between letters
    var captchaAudioText = "Type in the text box the following: " + captcha.text;

    // add answer and expiry to body
    var body = {answer: captcha.text, expiry: Date.now() + (CAPTCHA_SIGN_EXPIRY * 60000)};

    encrypt(body, PRIVATE_KEY)
      .then(function (validation) {
        if (validation === "") {
          // Error
          winston.error(`Validation Failed`);
          resolve({valid: false});
        } else {
          winston.debug(`validation: ` + JSON.stringify(validation));

          // Create an expiring JWT
          var expiry = jwt.sign({
            data: {nonce: payload.nonce}
          }, SECRET, {expiresIn: CAPTCHA_SIGN_EXPIRY + 'm'});

          // create basic response
          var responseBody = {
            nonce: payload.nonce,
            captcha: captcha.data,
            validation: validation,
            expiry: expiry
          };
          resolve(responseBody);

        }
      }, function (err) {
        winston.error(err);
        resolve({valid: false});
      });
  });
};
exports.getCaptcha = getCaptcha;

app.post('/captcha', function (req, res) {
  getCaptcha(req.body)
    .then(function (captcha) {
      winston.debug(`returning: ` + JSON.stringify(captcha));
      return res.send(captcha);
    });
});


////////////////////////////////////////////////////////
/*
 * Verify a captcha against it's encrypted response.
 * If successful, return a signed jwt by us.
 */
////////////////////////////////////////////////////////
var verifyCaptcha = function (payload) {
  winston.debug(`incoming payload: ` + JSON.stringify(payload));
  return new Promise(function (resolve, reject) {
    var validation = payload.validation;
    var answer = payload.answer;
    var nonce = payload.nonce;

    // Captcha by-pass for automated testing in dev/test environments
    if (process.env.BYPASS_ANSWER &&
      process.env.BYPASS_ANSWER.length > 0 &&
      process.env.BYPASS_ANSWER === answer) {

      // Passed the captcha test
      winston.debug(`Captcha bypassed! Creating JWT.`);

      var token = jwt.sign({
        data: {nonce: nonce}
      }, SECRET, {expiresIn: JWT_SIGN_EXPIRY + 'm'});
      resolve({valid: true, jwt: token});
    }

    // Normal mode, decrypt token
    decrypt(validation, PRIVATE_KEY)
      .then(function (body) {
        winston.debug(`verifyCaptcha decrypted: ` + JSON.stringify(body));
        if (body !== null) {

          // Check answer
          if (body.answer.toLowerCase() === answer.toLowerCase()) {

            // Check expiry
            if (body.expiry > Date.now()) {

              // Passed the captcha test
              winston.debug(`Captcha verified! Creating JWT.`);

              var token = jwt.sign({
                data: {nonce: nonce}
              }, SECRET, {expiresIn: JWT_SIGN_EXPIRY + 'm'});
              resolve({valid: true, jwt: token});
            }
            else {
              // incorrect answer
              winston.debug(`Captcha expired: ` + body.expiry + "; now: " + Date.now());
              resolve({valid: false});
            }
          }
          else {
            // incorrect answer
            winston.debug(`Captcha answer incorrect, expected: ` + answer + '; provided: ' + body.answer);
            resolve({valid: false});
          }
        } else {
          // Bad decyption
          winston.error(`Captcha decryption failed`);
          resolve({valid: false});
        }
      });
  });
};
exports.verifyCaptcha = verifyCaptcha;

app.post('/verify/captcha', function (req, res) {
  verifyCaptcha(req.body)
    .then(function (ret) {
      return res.send(ret);
    });
});

////////////////////////////////////////////////////////
/*
 * Get Audio
 */
////////////////////////////////////////////////////////
var getAudio = function (body) {
  winston.debug(`getting audio for`, body);
  return new Promise(function (resolve, reject) {
    try {
      // Ensure audio is enabled.
      if (!AUDIO_ENABLED || AUDIO_ENABLED !== "true") {
        winston.error('audio disabled but user attempted to getAudio');
        resolve({error: "audio disabled"});
        return;
      }

      // pull out encrypted answer
      var validation = body.validation;

      // decrypt payload to get captcha text
      decrypt(validation, PRIVATE_KEY)
        .then(function (body) {
          winston.debug('get audio decrypted body', body);

          // Insert leading text and commas to slow down reader
          var captchaCharArray = body.answer.toString().split("");
          var spokenCatpcha = "Please type in following letters or numbers: ";
          for (var i = 0; i < captchaCharArray.length; i++) {
            spokenCatpcha += captchaCharArray[i] + ", ";
          }

          getMp3DataUriFromText(spokenCatpcha).then(function (audioDataUri) {
            // Now pass back the full payload ,
            resolve({audio: audioDataUri});
          });

        });
    } catch (e) {
      winston.error('Error getting audio:', e);
      resolve({error: "unknown"});
    }
  });
};

app.post('/captcha/audio', function (req, res) {
  getAudio(req.body)
    .then(function (ret) {
      return res.send(ret);
    });
});

////////////////////////////////////////////////////////
/*
 * Verify a JWT generated by us.
 */
////////////////////////////////////////////////////////
var verifyJWT = function (token, nonce) {
  winston.debug(`verifying: ${token} against ${nonce}`);
  return new Promise(function (resolve, reject) {
    try {

      var decoded = jwt.verify(token, SECRET);
      winston.debug(`decoded: ` + JSON.stringify(decoded));

      if (decoded.nonce === nonce) {
        winston.debug(`Captcha Valid`);
        resolve({valid: true});
      } else {
        winston.debug(`Captcha Invalid!`);
        resolve({valid: false});
      }
    } catch (e) {
      winston.error(`Token/ResourceID Verification Failed: ` + JSON.stringify(e));
      resolve({valid: false});
    }
  });
};
exports.verifyJWT = verifyJWT;

app.post('/verify/jwt', function (req, res) {
  verifyJWT(req.body.token, req.body.nonce)
    .then(function (ret) {
      res.send(ret);
    });
});

////////////////////////////////////////////////////////
/*
 * Audio routines
 */
////////////////////////////////////////////////////////
function getMp3DataUriFromText(text) {
  winston.debug("Starting audio generation...");
  return new Promise(function (resolve, reject) {

    // init wave reader, used to convert WAV to PCM
    var reader = new wav.Reader();

    // we have to wait for the "format" event before we can start encoding
    reader.on('format', function (format) {
      // init encoder
      winston.debug("Init mp3 encoder");
      var encoder = new lame.Encoder(format);

      // Pipe Wav reader to the encoder and capture the output stream
      winston.debug("Pipe WAV reader to MP3 encoder");
      var outputStream = reader.pipe(encoder);

      // As the stream is encoded, convert the mp3 array buffer chunks into base64 string with mime type
      var dataUri = "data:audio/mp3;base64,";
      outputStream.on('data', function (arrayBuffer) {
        winston.debug("Encoder output received chunk of bytes, convert to base64 string");
        dataUri += arrayBuffer.toString('base64');
      });

      // When encoding is complete, callback with data uri
      outputStream.on('finish', function () {
        winston.debug("Finished converting to MP3");
        resolve(dataUri);
      });
    });

    // Generate audio, Base64 encoded WAV in DataUri format including mime type header
    winston.debug("Generate speach as WAV in ArrayBuffer");
    var audioArrayBuffer = meSpeak.speak(text, {rawdata: "ArrayBuffer"});

    // convert to buffer
    winston.debug("Convert arraybuffer to buffer");
    var audioBuffer = arrayBufferToBuffer(audioArrayBuffer);

    // Convert ArrayBuffer to Streamable type for input to the encoder
    winston.debug("Streamify our buffer");
    var audioStream = streamifier.createReadStream(audioBuffer);

    // once all events setup we can the pipeline
    winston.debug("Pipe audio stream to WAV reader");
    audioStream.pipe(reader);
  });
}

app.get('/status', function (req, res) {
  res.send("OK");
});
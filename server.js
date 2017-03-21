/*jshint node:true, esversion: 6 */
'use strict';

var bodyParser = require('body-parser');
var jose = require('node-jose');
var Buffer = require('buffer').Buffer;
var app = require('express')();
var jwt = require('jsonwebtoken');
var svgCaptcha = require('svg-captcha');
var winston = require('winston');

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
var LOG_LEVEL = process.env.LOG_LEVEL || "error";
var SERVICE_PORT = process.env.SERVICE_PORT || 3000;
var WINSTON_HOST = process.env.WINSTON_HOST;
var WINSTON_PORT = process.env.WINSTON_PORT;

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
 * Logger
 */
////////////////////////////////////////////////////////
if (process.env.SYSLOG_PORT) {
  require('winston-syslog').Syslog
  winston.add(winston.transports.Syslog, {
    host: 'logstash',
    port: process.env.SYSLOG_PORT,
    protocol: 'udp4',
    localhost: HOSTNAME
  })
}

function logger(obj, level) {
  if (LOG_LEVEL === "none") {
    return;
  } else if (level === "error" && (LOG_LEVEL === "error" || LOG_LEVEL === "debug")) {
    winston.log(level, new Error(obj));
  } else if (level === "debug" && LOG_LEVEL === "debug") {
    winston.log(level, obj);
  }
}

////////////////////////////////////////////////////////
/*
 * App Startup
 */
////////////////////////////////////////////////////////
app.use(bodyParser.json());

var args = process.argv;
if (args.length == 3 && args[2] == 'server') {
  var server = app.listen(SERVICE_PORT, '0.0.0.0', function () {
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
  logger(`to decrypt body: ` + JSON.stringify(body), "debug");
  return new Promise(function (resolve, reject) {
    try {
      jose.JWK.asKey(private_key, "json")
        .then(function (res) {
          jose.JWE.createDecrypt(res)
            .decrypt(body)
            .then(function (decrypted) {
              var decryptedObject = JSON.parse(decrypted.plaintext.toString('utf8'));
              logger('decrypted object: ' + JSON.stringify(decryptedObject), "debug");
              resolve(decryptedObject);
            });
        });
    } catch (e) {
      logger(`err: ` + JSON.stringify(e), "error");
      reject(e);
    }
  });
}
function encrypt(body) {
  logger(`encrypt: ` + JSON.stringify(body), "debug");
  return new Promise(function (resolve, reject) {

    var buff = new Buffer(JSON.stringify(body));
    try {
      jose.JWE.createEncrypt(PRIVATE_KEY)
        .update(buff)
        .final()
        .then(function (cr) {
          logger(`encrypted: ` + JSON.stringify(cr), "debug");
          resolve(cr);
        }, function (e) {
          logger(`err: ` + JSON.stringify(e), "error");
          reject(e);
        });
    } catch (e) {
      logger(`err: ` + JSON.stringify(e), "error");
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
  logger(`getCaptcha: ${payload.nonce}`, "debug");
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
    logger(`captcha generated: ${captcha.text}`, "debug");

    // add expiry to body
    var body = {answer: captcha.text, expiry: Date.now() + (CAPTCHA_SIGN_EXPIRY * 60000)};

    encrypt(body, PRIVATE_KEY)
      .then(function (validation) {
        if (validation === "") {
          // Error
          logger(`Validation Failed`, "error");
          resolve({valid: false});
        } else {
          logger(`validation: ` + JSON.stringify(validation), "debug");
          // Create an expiring JWT
          var expiry = jwt.sign({
            data: {nonce: payload.nonce}
          }, SECRET, {expiresIn: CAPTCHA_SIGN_EXPIRY + 'm'});
          resolve({nonce: payload.nonce, captcha: captcha.data, validation: validation, expiry: expiry});
        }
      }, function (err) {
        logger(err, "error");
        resolve({valid: false});
      });
  });
};
exports.getCaptcha = getCaptcha;

app.post('/captcha', function (req, res) {
  getCaptcha(req.body)
    .then(function (captcha) {
      logger(`returning: ` + JSON.stringify(captcha), "debug");
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
  logger(`incoming payload: ` + JSON.stringify(payload), "debug");
  return new Promise(function (resolve, reject) {
    var validation = payload.validation;
    var answer = payload.answer;
    var nonce = payload.nonce;

    // Captcha by-pass for automated testing in dev/test environments
    if (process.env.BYPASS_ANSWER &&
        process.env.BYPASS_ANSWER.length > 0 &&
        process.env.BYPASS_ANSWER === answer) {

        // Passed the captcha test
        logger(`Captcha bypassed! Creating JWT.`, "debug");

        var token = jwt.sign({
            data: {nonce: nonce}
        }, SECRET, {expiresIn: JWT_SIGN_EXPIRY + 'm'});
        resolve({valid: true, jwt: token});
    }

    // Normal mode, decrypt token
    decrypt(validation, PRIVATE_KEY)
      .then(function (body) {
        logger(`verifyCaptcha decrypted: ` + JSON.stringify(body), "debug");
        if (body !== null) {

          // Check answer
          if (body.answer === answer) {

            // Check expiry
            if (body.expiry > Date.now()) {

              // Passed the captcha test
              logger(`Captcha verified! Creating JWT.`, "debug");

              var token = jwt.sign({
                data: {nonce: nonce}
              }, SECRET, {expiresIn: JWT_SIGN_EXPIRY + 'm'});
              resolve({valid: true, jwt: token});
            }
            else {
              // incorrect answer
              logger(`Captcha expired: ` + body.expiry + "; now: " + Date.now(), "debug");
              resolve({valid: false});
            }
          }
          else {
            // incorrect answer
            logger(`Captcha answer incorrect`, "debug");
            resolve({valid: false});
          }
        } else {
          // Bad decyption
          logger(`Captcha decryption failed`, "error");
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
 * Verify a JWT generated by us.
 */
////////////////////////////////////////////////////////
var verifyJWT = function (token, nonce) {
  logger(`verifying: ${token} against ${nonce}`, "debug");
  return new Promise(function (resolve, reject) {
    try {

      var decoded = jwt.verify(token, SECRET);
      logger(`decoded: ` + JSON.stringify(decoded), "debug");

      if (decoded.nonce === nonce) {
        logger(`Captcha Valid`, "debug");
        resolve({valid: true});
      } else {
        logger(`Captcha Invalid!`, "debug");
        resolve({valid: false});
      }
    } catch (e) {
      logger(`Token/ResourceID Verification Failed: ` + JSON.stringify(e), "error");
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

app.get('/status', function (req, res) {
  res.send("OK");
});
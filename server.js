/*jshint node:true, esversion: 6 */
'use strict';

var bodyParser  		= require('body-parser');
var jose 				= require('node-jose');
var Buffer 				= require('buffer').Buffer;
var app 				= require('express')();
var jwt 				= require('jsonwebtoken');
var svgCaptcha 			= require('svg-captcha');
var CAPTCHA_SIGN_EXPIRY = process.env.CAPTCHA_SIGN_EXPIRY || "15"; // In minutes
var JWT_SIGN_EXPIRY 	= process.env.JWT_SIGN_EXPIRY || "15"; // In minutes
var SECRET 				= process.env.SECRET || "defaultSecret";
var PRIVATE_KEY 		= process.env.PRIVATE_KEY ? JSON.parse(process.env.PRIVATE_KEY)
	: { kty: 'oct', kid: 'gBdaS-G8RLax2qObTD94w', use: 'enc', alg: 'A256GCM', k: 'FK3d8WvSRdxlUHs4Fs_xxYO3-6dCiUarBwiYNFw5hv8' };
var LOG_LEVEL			= process.env.LOG_LEVEL || "error";
var SERVICE_PORT 		= process.env.SERVICE_PORT || 3000;

// Prevent default keys going into production
if (process.env.NODE_ENV == 'production') {
	if (SECRET == 'defaultSecret' ||
		PRIVATE_KEY.kid == 'gBdaS-G8RLax2qObTD94w') {

		console.log("You MUST change SECRET and PRIVATE_KEY before running in a production environment.");
		process.exit(1);
	}
}

////////////////////////////////////////////////////////
/*
 * Logger
 */
////////////////////////////////////////////////////////
function logger(obj, level) {
	if (LOG_LEVEL === "none") {
		return;
	} else if (level === "error" && (LOG_LEVEL === "error" || LOG_LEVEL === "debug")) {
		console.error(new Error(obj));
	} else if (level === "debug" && LOG_LEVEL === "debug") {
		console.log(obj);
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
		console.warn(`MyGov Captcha Service listening at http://${host}:${port}`);
		console.warn(`Log level is at: ${LOG_LEVEL}`);
	});
	}

////////////////////////////////////////////////////////
/*
 * Encryption Routines
 */
////////////////////////////////////////////////////////
function decrypt(password, private_key) {
	logger(`decrypt: ${password}`, "debug");
	return new Promise(function (resolve, reject) {
		try {
			jose.JWK.asKey(private_key, "json")
			.then(function (res) {
				jose.JWE.createDecrypt(res)
				.decrypt(password)
				.then(function (decrypted) {
					logger(`decrypt: ${decrypted.plaintext.toString('utf8')}`, "debug");
					resolve(decrypted.plaintext.toString('utf8'));
				});
			});
		} catch (e) {
			logger(`err: ${e}`, "error");
			reject(e);
		}
	});
}
function encrypt(password, private_key) {
	logger(`encrypt: ${password}`, "debug");
	return new Promise(function (resolve, reject) {
		var buff = new Buffer(password);
		try {
			jose.JWE.createEncrypt(PRIVATE_KEY)
			.update(buff)
			.final()
			.then(function (cr) {
				logger(`encrypted: ${cr}`, "debug");
				resolve(cr);
			}, function (e) {
                logger(`err: ${e}`, "error");
                reject(e);
			});
		} catch (e) {
			logger(`err: ${e}`, "error");
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
		var captcha = svgCaptcha.create();
		if (!captcha || (captcha && !captcha.data)) {
			// Something bad happened with Captcha.
			resolve({valid: false});
		}
		logger(`captcha generated: ${captcha.text}`, "debug");

		encrypt(captcha.text, PRIVATE_KEY)
		.then(function (validation) {
			if (validation === "") {
				// Error
				logger(`Validation Failed`, "error");
				resolve({valid: false});
			} else {
				logger(`validation: ${validation}`, "debug");
				// Create an expiring JWT
				var expiry = jwt.sign({
					data: {nonce: payload.nonce}
				}, SECRET, { expiresIn: CAPTCHA_SIGN_EXPIRY + 'm'});
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
		logger(`returning: ${captcha}`, "debug");
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
	logger(`incoming payload: ${payload}`, "debug");
	return new Promise(function (resolve, reject) {
		var validation = payload.validation;
		var answer = payload.answer;
		var nonce = payload.nonce;
		var expiry = payload.expiry;
		logger(`validation: ${validation}`, "debug");
		logger(`answer: ${answer}`, "debug");

		try {
			var decoded = jwt.verify(expiry, SECRET);
			logger(`decoded: ${decoded}`, "debug");

			if (decoded.data.nonce !== nonce) {
				logger(`Captcha Invalid!`, "debug");
				return resolve({valid: false});
			}
		} catch (e) {
			return resolve({valid: false, message: e.message});
		}

		decrypt(validation, PRIVATE_KEY)
		.then(function (obj) {
			logger(`verifyCaptcha decrypted: ${obj}`, "debug");
			if (obj === answer) {
				// Passed the captcha test
				logger(`Captcha verified! Creating JWT.`, "debug");

				var token = jwt.sign({
					data: {nonce: nonce}
				}, SECRET, { expiresIn: JWT_SIGN_EXPIRY + 'm'});
				resolve({ valid: true, jwt: token });
			} else {
				logger(`Captcha answer invalid!`, "error");
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
var verifyJWT = function (token, answer) {
	logger(`verifying: ${token} against ${answer}`, "debug");
	return new Promise(function (resolve, reject) {
		try {

			var decoded = jwt.verify(token, SECRET);
			logger(`decoded: ${decoded}`, "debug");

			if (decoded.answer === answer) {
				logger(`Captcha Valid`, "debug");
				resolve({valid: true});
			} else {
				logger(`Captcha Invalid!`, "debug");
				resolve({valid: false});
			}
		} catch (e) {
			logger(`Token/ResourceID Verification Failed: ${e}`, "error");
			resolve({valid: false});
		}
	});
};
exports.verifyJWT = verifyJWT;

app.post('/verify/jwt', function (req, res) {
	verifyJWT(req.body.token, req.body.answer)
	.then(function (ret) {
		res.send(ret);
	});
});

app.get('/status', function (req, res) {
    res.send("OK");
});
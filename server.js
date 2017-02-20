/*jshint node:true, esversion: 6 */
'use strict';

var bodyParser  	= require('body-parser');
var jose 			= require('node-jose');
var keystore 		= jose.JWK.createKeyStore();
var Buffer 			= require('buffer').Buffer;
var app 			= require('express')();
var jwt 			= require('jsonwebtoken');
var svgCaptcha 		= require('svg-captcha');
var SECRET 			= process.env.SECRET || "defaultSecret";
var SALT 			= process.env.SALT || "defaultSalt";
var PRIVATE_KEY 	= process.env.PRIVATE_KEY || { kty: 'oct', kid: 'gBdaS-G8RLax2qObTD94w', use: 'enc', alg: 'A256GCM', k: 'FK3d8WvSRdxlUHs4Fs_xxYO3-6dCiUarBwiYNFw5hv8' };
var LOG_LEVEL		= process.env.LOG_LEVEL || "error";
var SERVICE_PORT 	= process.env.SERVICE_PORT || 3000;

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
		var buff = Buffer.from(password, 'utf8');
		try {
			jose.JWE.createEncrypt(PRIVATE_KEY)
			.update(buff)
			.final()
			.then(function (cr) {
				logger(`encrypted: ${cr}`, "debug");
				resolve(cr);
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
				resolve({nonce: payload.nonce, captcha: captcha.data, validation: validation});
			}
		}, function (err) {
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
		logger(`validation: ${validation}`, "debug");
		logger(`answer: ${answer}`, "debug");

		decrypt(validation, PRIVATE_KEY)
		.then(function (obj) {
			logger(`verifyCaptcha decrypted: ${obj}`, "debug");
			if (obj === answer) {
				// Passed the captcha test
				logger(`Captcha verified! Creating JWT.`, "debug");

				var token = jwt.sign({nonce: nonce}, SECRET);
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
var verifyJWT = function (token, nonce) {
	logger(`verifying: ${token} against ${nonce}`, "debug");
	return new Promise(function (resolve, reject) {
		try {

			var decoded = jwt.verify(token, SECRET);
			logger(`decoded: ${decoded}`, "debug");

			if (decoded.nonce === nonce) {
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
	verifyJWT(req.body.token, req.body.nonce)
	.then(function (ret) {
		res.send(ret);
	});
});

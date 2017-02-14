/*jshint node:true, esversion: 6 */
var service = require ('mygovbc-captcha-widget');
var jwt = require('jsonwebtoken');
var crypto = require('crypto');
var open = require('open');
var path = require('path').basename(__dirname);

var resourceID = crypto.randomBytes(64).toString('hex');
var c = service.getCaptcha({nonce: resourceID});

if (!c.captcha) {
	console.log("Captcha was not generated.");
	process.exit(1);
}
if (!c.validation) {
	console.log("Encrypted answer not found.");
	process.exit(1);
}
// console.log("validation:", c.validation);

var fs = require('fs');
fs.writeFile(__dirname + "/test.html", c.captcha, function(err) {
	if(err) {
		console.log("could not write to filesystem:", err);
		process.exit(1);
	}
	// console.log("The file was saved!", __dirname);
	open("file:///" + __dirname + "\\" + "test.html");
});

const readline = require('readline');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

rl.question('What is the answer to the captcha?', (answer) => {
	rl.close();

	var payload = {nonce: resourceID, encryptedAnswer: c.validation, answer: answer};
	// console.log("payload:", payload);
	var signedJWT = service.verifyCaptcha(payload);
	if (signedJWT && signedJWT.valid === false) {
		console.log("Captcha answer was wrong.");
		process.exit(1);
	}
	// console.log("JWT:", signedJWT);

	var verified = service.verifyJWT(signedJWT, resourceID);
	if (verified && verified.valid === true) {
		console.log("Client Verified!");
		process.exit();
	} else {
		console.log("Client Failed.");
		process.exit(1);
	}
});


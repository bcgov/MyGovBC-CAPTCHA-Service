var service = require ('mygovbc-captcha-widget');
var jwt = require('jsonwebtoken');
var crypto = require('crypto');
var open = require('open');
var path = require('path').basename(__dirname);

var resourceID = crypto.randomBytes(64).toString('hex');
var c = service.getCaptcha({nonce: resourceID});
console.log("validation:", c.validation);

var fs = require('fs');
fs.writeFile("./test.html", c.captcha, function(err) {
	if(err) {
		return console.log(err);
	}
	console.log("The file was saved!", __dirname);
	open("file:///" + __dirname + "\\" + "test.html");
});

const readline = require('readline');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

rl.question('What is the answer to the captcha?', (answer) => {
	var payload = {nonce: resourceID, encryptedAnswer: c.validation, answer: answer};
	console.log("payload:", payload);
	var signedJWT = service.verifyCaptcha(payload);
	console.log("JWT:", signedJWT);

	var verified = service.verifyJWT(signedJWT, resourceID);
	if (verified && verified.valid == true) {
		console.log("Client Verified!");
	} else {
		console.log("Client Failed.");
	}

	rl.close();
});


/*jshint node:true */
'use strict';

var crypto = require('crypto');

var generatePrivateKey = function () {
    var key = crypto.randomBytes(256).toString('base64');
    console.log("Key Generated:", key);
    return key;
};
exports.generatePrivateKey = generatePrivateKey;

generatePrivateKey();
/*jshint node:true */
'use strict';

var crypto = require('crypto');
var winston = require('winston')

var generatePrivateKey = function () {
    var key = crypto.randomBytes(256).toString('base64');
    winston.info("Key Generated:", key);
    return key;
};
exports.generatePrivateKey = generatePrivateKey;

generatePrivateKey();
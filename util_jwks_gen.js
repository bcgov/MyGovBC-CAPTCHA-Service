var jose = require('node-jose');
var keystore = jose.JWK.createKeyStore();
var winston = require('winston')

var props = {
  kid: 'mygovbc-captcha-service-1',
  alg: 'A256GCM',
  use: 'enc'
};
keystore.generate("oct", 256, props).then(function (result) {
  // {result} is a jose.JWK.Key
  key = result;
  winston.info(JSON.stringify(key.toJSON(true)));
});

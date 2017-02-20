var jose 			= require('node-jose');
var keystore 		= jose.JWK.createKeyStore();

var props = {
    kid: 'mygovbc-captcha-service-1',
    alg: 'A256GCM',
    use: 'enc'
};
keystore.generate("oct", 256, props).then(function(result) {
    // {result} is a jose.JWK.Key
    key = result;
    console.log(key.toJSON(true));
});

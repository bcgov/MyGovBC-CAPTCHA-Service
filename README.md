# MyGovBC-CAPTCHA

#### A CAPTCHA microservice

This project contains a microservice to enable you to easily include a CAPTCHA widget in my online digital form to protect your digital service from bots.  

This is just the service part of an overall solution, for user interface components see:

* https://github.com/bcgov/MyGovBC-CAPTCHA-Widget

#### Overall Use Case

1. User agent i.e. browser loads the widget, feeding it with a nonce a.k.a. resource identifier
2. Widget calls Service and displays CAPTCHA challenge to user
3. User responds to challenge
4. Widget sends user response to Service
5. Service validates the response
6. Service returns validation result and a signed JWT containing the nonce if passes
7. Widget displays success/failure to user
8. User agent includes the JWT in resource server api call i.e. form submission
9. Resource server confirms the validity of the signed JWT in one of the two ways
    1. if sesource server holds the shared secret, then it can decode the JWT using the shared secret and compare the nonce in the decoded JWT with nonce associated with the request
    2. call the `/verify/jwt` service API, passing JWT and nonce associated with the request. In such case resource server doesn't need to hold the shared secret.
10. Resource server allows/denies access to resource based on the outcome of the JWT validation

###### Git Checkout and initialization:
```
git clone git@github.com:bcgov/MyGovBC-CAPTCHA-Service.git
cd MyGovBC-CAPTCHA-Service/
```

Use one of the following ways to configure the service
1. add a *.env* file in the app root containing the environment variables in the form of NAME=VALUE in each line
2. set environment variables prior to launching the program

If an environment variable is defined in both ways, the latter way takes precedence.

The following is a list of the environment variables:

* NODE_ENV (optional)
    > If running in a production environment, you should set this to "production" to force you to se SECRET and PRIVATE_KEY accordingly.
* SECRET (required)
    > Shared secret in the form of an arbitrary string for encrypting/decrypting JWT. The secret must be the same on all nodes of the service cluster. The secret can be shared with resource server if resource server is designed to validate JWT itself.
* PRIVATE_KEY (required)
    > Symmetric key for encrypting/decrypting captcha answer. The key must be the same on all nodes of the service cluster and restricted for use within the cluster only. A new key can be generated by running `node util_jwks_gen.js` from app root.
* AUTHORIZED_RESOURCE_SERVER_IP_RANGE_LIST (optional)
    > A list of resource servers allowed to access `/verify/jwt` endpoint in the form of IPs or CIDR ranges separated by comma. For example `127.0.0.1, 10.0.0.0/8`. To grant access to the Internet, set the variable to `0.0.0.0/0`. Default to `127.0.0.1`.
* WINSTON_HOST (optional)
    >  The remote host that winston service is running on, if you're using winston in your deployment.
* WINSTON_PORT (optional)
    >  The remote port that winston is listening on, if using winston in your deployment.
* LOG_LEVEL (optional)
    > Set this to none/error/debug depending on how much verbosity to stderr/stdout you would like.
* SERVICE_PORT (optional)
    > What port you want the service to run on, defaults to 8080.
* CAPTCHA_SIGN_EXPIRY (optional)
    > Time in minutes you want to automatically expire the Captcha returned to clients (default: 15min)
* JWT_SIGN_EXPIRY (optional)
    > Time in minutes you want to automatically expire the Service JWT returned to clients (default: 15min)
* AUDIO_ENABLED (optional)
    > true/false to have service return audio for the captcha text.  Audio is a mp3 in DataUri format. 
* CORS_ALLOW_ALL (optional)
    > true/false to have service accept any host, used only for dev/test purposes only 
* BYPASS_ANSWER (optional)
    > A pass-for-sure answer used for automated testing. Never set the variable in production.
###### Preparing for dependencies:
```
npm install
```
This will download  all the required dependencies for the project so that npm start/npm test will work.

###### Running the service:
```
npm start
```

###### Running the unit tests locally:
```
npm test
```

The tests cover the following cases:
1. Empty request on requesting a captcha (must fail)
2. Passing in a nonce for generating the captcha (must pass and return valid captcha
3. If either the captcha failed to generate, or the encrypted password sent with the request fails, the unit test will fail. (must pass)
4. The captcha is written to disk, and the default browser is used to open the captcha for viewing, the user must then input the correct captcha, or the test will fail (must pass)
5. Verifying the captcha (must pass)
6. Receiving and then sending back the signed JWT (must pass)


###### API Specification:
Request Type | API Endpoint | Parameters | Returns | Purpose
------------ | ------------- | ------------- | ------------- | -------------
HTTP GET | / or /status | | OK | Returns "OK" if the service is running
HTTP POST | /captcha | request body: { nonce: string } | {  "nonce": string,  "captcha": string,  validation": JSON}| Retrieve a captcha to be displayed to a user
HTTP POST | /captcha/audio | request body: { validation: string } | {  "audio": dataUri}| Retrieve the audio for a given captcha validation object, returns MP3 in DataUri format
HTTP POST | /verify/captcha | request body: { nonce: string, answer: string, validation: JSON } | { valid: true/false, jwt: JWT } | Compare the answer to the encryptedAnswer, return a signed JWT if successful
HTTP POST | /verify/jwt | request body: { nonce: string, token: JWT } | { valid: true/false } | Validate a signed JWT by resource server

#### API Demo
You can try it out the API for yourself at our demo environment by following the above API specs:

https://captcha-demo.pathfinder.gov.bc.ca/


#### Build/Deploy Setup

For Jenkins 2.x use the `Jenkinsfile` pipeline script.  Requires `NodeJS 4+ plugin`. 

For OpenShift s2i, see [Deploy to OpenShift](openshift/README.md) docs.

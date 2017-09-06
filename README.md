# MyGovBC-CAPTCHA

#### A CAPTCHA microservice

This project contains a microservice to enable you to easily include a CAPTCHA widget in my online digital form to protect your digital service from bots.  

This is just the service part of an overall solution, for user interface components see:

* https://github.com/bcgov/MyGovBC-CAPTCHA-Widget

#### Overall System Use Case

1. Client loads widget and a resource identifier (like a nonce)
2. Widget executes and displays CAPTCHA challenge to user
3. User responds to challenge
4. Widget sends user response to Service
5. Service verifies response
6. Service returns signed JWT including the nonce
7. Widget notifies Client of success/failure
8. Client includes JWT in Resource API call
9. Resource API confirms validity of the signed JWT
10. Resource API match resource identifier in the path, query or request body, with resource identifier in the signed JWT
11. Resource API allows/denies access to resource

###### Git Checkout and initialization:
```
git clone git@github.com:bcgov/MyGovBC-CAPTCHA-Service.git
cd MyGovBC-CAPTCHA-Service/
```

You have two choices of configuring the service
1. add some environment variables
2. open server.js and change the default strings.

The following is a list of the environment variables:

* NODE_ENV (optional)
    > If running in a production environment, you should set this to "production" to force you to se SECRET and PRIVATE_KEY accordingly.
* SECRET (required)
    > This should be the same on each server/service/pod that will need to verify the JWT created by any other server/service/pod.
* PRIVATE_KEY (required)
    > This is for encrypting the answer in the captcha for stateless verification on any other server/service/pod.
* WINSTON_HOST (optional)
    >  The remote host that winston service is running on, if using winston in your deployment.
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
HTTP GET | /status | | OK | Returns "OK" if the service is running
HTTP POST | /captcha | request body: { nonce: string } | {  "nonce": string,  "captcha": string,  validation": JSON,  "expiry": JWT}| Retrieve a captcha to be displayed to a user
HTTP POST | /captcha/audio | request body: { validation: string } | {  "audio": dataUri}| Retrieve the audio for a given captcha validation object, returns MP3 in DataUri format
HTTP POST | /verify/captcha | request body: { nonce: string, answer: string, validation: JSON } | { valid: true/false, jwt: JWT } | Compare the answer to the encryptedAnswer, return a signed JWT if successful
HTTP POST | /verify/jwt | request body: { nonce: string, token: JWT } | { valid: true/false } | Validate a signed JWT

#### API Demo
You can try it out the API for yourself at our demo environment by following the above API specs:

https://mygovbc-captcha-service-demo.pathfinder.gov.bc.ca


#### Build/Deploy Setup

For Jenkins 2.x use the `Jenkinsfile` pipeline script.  Requires `NodeJS 4+ plugin`. 

For OpenShift s2i, see [Deploy to OpenShift](openshift/README.md) docs.

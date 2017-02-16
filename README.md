# MyGovBC-CAPTCHA

#### A CAPTCHA microservice

This project contains a microservice to enable you to easily include a CAPTCHA widget in my online digital form to protect your digital service from bots.

###### Git Checkout and initialization:
```
git clone git@github.com:bcgov/MyGovBC-CAPTCHA-Service.git
cd MyGovBC-CAPTCHA-Service/
```

You have two choices of configuring the service
1. add some environment variables
2. open server.js and change the default strings.

The following is a list of the environment variables:

* SECRET
    > This should be the same on each server/service/pod that will need to verify the JWT created by any other server/service/pod.
* SALT
    > This is for encrypting the answer in the captcha for stateless verification on any other server/service/pod.
* PRIVATE_KEY
    > (Not used) Placeholder for default encryption cipher used internally to the microservice.
* LOG_LEVEL
    > Set this to none/error/debug depending on how much verbosity to stderr/stdout you would like.
* SERVICE_PORT
    > What port you want the service to run on, defaults to 3000.


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
Request Type | API Endpoint | Parameters | Purpose
------------ | ------------- | ------------- | -------------
HTTP POST | /captcha | request body: { nonce: "string" } | Retrieve a captcha to be displayed to a user
HTTP POST | /verify/captcha | request body: { nonce: "string", answer: "string", encryptedAnswer: "string" } | Compare the answer to the encryptedAnswer, return a signed JWT if successful
HTTP POST | /verify/jwt | request body: { nonce: "string", token: "jwt token" } | Validate a signed JWT

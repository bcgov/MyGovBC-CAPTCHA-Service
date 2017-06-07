# OpenShift

## Build Setup

Build using the stock NodeJS 4.x image on OpenShift.  Simply `Add to Project` and point it 
to the latest release version number NOT the head of master.  For example, `Source ref: v4`.

## Deployment Setup
After some experimenting the optimal deployment profile for this service is:

```
2 pods or autoscaler 2-4 pods set to 70% CPU trigger
CPU Request: 5 millicores
CPU Limit: 1 core
Memory Request: 100 MiB
Memory Limit: 1 GiB (although we never hit this limit in our testing) 
```

### Change Propagation
To promote runtime image from one environment to another, for example from *dev* to *test*, run

```
oc tag <yourprojectname-tools>/mygovbc-captcha-service:latest <yourprojectname-test>/mygovbc-captcha-service:latest <yourprojectname-tools>/mygovbc-captcha-service:test
```
The above command will deploy the latest/dev runtime image to *test* env. The purpose of tagging runtime image of *test* env in both \<yourprojectname-test\>/mygovbc-captcha-service:latest and \<yourprojectname-tools\>/mygovbc-captcha-service:test is to use \<yourprojectname-tools\>/mygovbc-captcha-service:test as backup such that in case the image stream \<yourprojectname-test\>/mygovbc-captcha-service, which is used by *test* runtime pods, is deleted inadvertently, it can be recovered from \<yourprojectname-tools\>/mygovbc-captcha-service:test.

The command can be setup as a Jenkins task to facilitate using Jenkins to orchestrate deployment of entire application.


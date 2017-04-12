## Runtime Setup
TBD

## Deployment
TBD

### Change Propagation
To promote runtime image from one environment to another, for example from *dev* to *test*, run

```
oc tag <yourprojectname-tools>/mygovbc-captcha-service:latest <yourprojectname-test>/mygovbc-captcha-service:latest <yourprojectname-tools>/mygovbc-captcha-service:test
```
The above command will deploy the latest/dev runtime image to *test* env. The purpose of tagging runtime image of *test* env in both \<yourprojectname-test\>/mygovbc-captcha-service:latest and \<yourprojectname-tools\>/mygovbc-captcha-service:test is to use \<yourprojectname-tools\>/mygovbc-captcha-service:test as backup such that in case the image stream \<yourprojectname-test\>/mygovbc-captcha-service, which is used by *test* runtime pods, is deleted inadvertently, it can be recovered from \<yourprojectname-tools\>/mygovbc-captcha-service:test.

The command can be setup as a Jenkins task to faciliate using Jenkins to orchestrate deployment of entire application.

## Tips
To find source code commit point of a runtime instance on OpenShift, open a terminal on one of the running pods and run command `git rev-parse HEAD` in cwd.

// jenkins file for splunk-forwarder

def APP_NAME = 'mygovbc-captcha-service'
def APP_VERSION = 'master'
def TAG_NAMES = ['dev', 'test', 'prod']

def BUILD_CONFIG = APP_NAME 
def IMAGESTREAM_NAME = APP_NAME

node {

    stage('build') {
       echo "Building: " + BUILD_CONFIG
       openshiftBuild bldCfg: BUILD_CONFIG, showBuildLogs: 'true'
       openshiftTag destStream: IMAGESTREAM_NAME, verbose: 'true', destTag: '$BUILD_ID', srcStream: IMAGESTREAM_NAME, srcTag: 'latest'
    }

    stage('deploy-' + TAG_NAMES[0]) {
       echo "Deploying to: " + TAG_NAMES[0]
       echo "tag source " + IMAGESTREAM_NAME + " with tag " + '$BUILD_ID' + " to dest " + IMAGESTREAM_NAME
       openshiftTag destStream: IMAGESTREAM_NAME, verbose: 'true', destTag: TAG_NAMES[0], srcStream: IMAGESTREAM_NAME, srcTag: '$BUILD_ID'
    }
}

node {
  stage('deploy-' + TAG_NAMES[1]) {
    input "Deploy to " + TAG_NAMES[1] + "?"
    openshiftTag destStream: IMAGESTREAM_NAME, verbose: 'true', destTag: TAG_NAMES[1], srcStream: IMAGESTREAM_NAME, srcTag: '$BUILD_ID'
  }
}

node {
  stage('deploy-'  + TAG_NAMES[2]) {
    input "Deploy to " + TAG_NAMES[2] + "?"
    openshiftTag destStream: IMAGESTREAM_NAME, verbose: 'true', destTag: TAG_NAMES[2], srcStream: IMAGESTREAM_NAME, srcTag: '$BUILD_ID'
  }
}


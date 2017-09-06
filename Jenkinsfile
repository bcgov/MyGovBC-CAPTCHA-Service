node('master') {
    stage('checkout') {
       echo "checking out source"
       echo "Build: ${BUILD_ID}"
       checkout scm
    }
	 
	stage('build') {
	 echo "Building..."
	 openshiftBuild bldCfg: "mygovbc-captcha-service", showBuildLogs: 'true'
	 openshiftTag destStream: "mygovbc-captcha-service", verbose: 'true', destTag: '$BUILD_ID', srcStream: "mygovbc-captcha-service", srcTag: 'latest'
	 openshiftTag destStream: "mygovbc-captcha-service", verbose: 'true', destTag: 'dev', srcStream: "mygovbc-captcha-service", srcTag: 'latest'
    }
}


stage('deploy-test') {
  input "Deploy to test?"
  
  node('master'){
     openshiftTag destStream: 'mygovbc-captcha-service', verbose: 'true', destTag: 'test', srcStream: 'mygovbc-captcha-service', srcTag: '$BUILD_ID'
  }
}

stage('deploy-prod') {
  input "Deploy to prod?"
  node('master'){
     openshiftTag destStream: 'mygovbc-captcha-service', verbose: 'true', destTag: 'prod', srcStream: 'mygovbc-captcha-service', srcTag: '$BUILD_ID'
  }
  
}


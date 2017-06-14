pipeline {
    agent any
    stages {
        stage("Checkout") {
            steps {
                checkout scm
            }
        }
        stage('Build') {
            steps {
                nodejs(configId: '1a7ab0e4-263d-494f-8f34-ec8a8268f48f', nodeJSInstallationName: 'NodeJS-v8') {
                        sh 'npm install'
                }
            }
        }
    }
}
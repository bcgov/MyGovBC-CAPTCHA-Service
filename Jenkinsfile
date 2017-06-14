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
                nodejs(nodeJSInstallationName: 'NodeJS-V8.x') {
                        sh 'npm install'
                }
            }
        }
    }
}
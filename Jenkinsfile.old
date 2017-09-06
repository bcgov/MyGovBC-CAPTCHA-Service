pipeline {
    agent any
    tools {
        nodejs 'NodeJS-V8.x'
    }
    stages {
        stage("Checkout") {
            steps {
                checkout scm
            }
        }
        stage('Build') {
            steps {
                sh 'npm install'
            }
        }
        stage('Test') {
            steps {
                sh 'npm test'
            }
        }
    }
}
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
                nodejs(configId: 'f6142fba-6158-46a7-8d0e-d22b0afd3d5a', nodeJSInstallationName: 'NodeJS-V8.x') {
                    // some block
                }
            }
        }
    }
}
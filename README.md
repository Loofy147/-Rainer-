# Rainar

Rainar is an integrated development reality, a sovereign platform designed to transmute raw ideas into enterprise-grade software with unprecedented velocity and architectural integrity.

## Architecture

Rainar is built on a foundation of cloud-native principles, leveraging a microservices architecture orchestrated by Kubernetes. The entire system is defined as code, ensuring that it is reproducible, scalable, and resilient.

### Infrastructure as Code

The Rainar platform itself is defined by a set of Kubernetes manifests located in the `infrastructure/k8s` directory. These manifests describe the desired state of the system, including deployments, services, and autoscalers.

### Development and Deployment Automation

We use [Skaffold](https://skaffold.dev/) to automate the development and deployment workflow. The `skaffold.yaml` file in the root of the repository defines the entire process of building, tagging, and deploying the Rainar backend to a Kubernetes cluster.

## Getting Started

To run the Rainar platform for development, you will need to have the following tools installed:

*   [Docker](https://www.docker.com/)
*   [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/)
*   [Skaffold](https://skaffold.dev/docs/install/)
*   A local Kubernetes cluster, such as [Minikube](https://minikube.sigs.k8s.io/docs/start/) or [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/)

Once you have these tools installed, you can spin up the entire Rainar backend with a single command:

```bash
skaffold dev
```

This command will:

1.  Build the Docker images for all the microservices.
2.  Deploy the Kubernetes manifests to your local cluster.
3.  Stream the logs from all the running services to your terminal.
4.  Watch for changes to the source code and automatically redeploy the services when changes are detected.

# Rainar

Rainar is an integrated development reality, a sovereign platform designed to transmute raw ideas into enterprise-grade software with unprecedented velocity and architectural integrity.

## Architecture

Rainar is built on a foundation of cloud-native principles, leveraging a microservices architecture orchestrated by Kubernetes. The entire system is defined as code, ensuring that it is reproducible, scalable, and resilient.

### Infrastructure as Code

The Rainar platform itself is defined by a set of Kubernetes manifests located in the `infrastructure/k-s` directory. These manifests describe the desired state of the system, including deployments, services, and autoscalers.

### System Components

The Rainar platform is composed of the following services:

*   **`project-service`**: A backend service responsible for providing project templates as downloadable zip archives and creating GitHub repositories.
*   **`dashboard`**: A Next.js frontend application that provides the user interface for the Rainar platform.

### Networking

All traffic to the Rainar platform is routed through a single Ingress controller. The Ingress is configured to route traffic to the appropriate service based on the URL path:

*   `/api/*`: Routed to the `project-service`.
*   `/*`: Routed to the `dashboard`.

### Development and Deployment Automation

We use [Skaffold](https://skaffold.dev/) to automate the development and deployment workflow. The `skaffold.yaml` file in the root of the repository defines the entire process of building, tagging, and deploying the Rainar backend to a Kubernetes cluster.

## Getting Started

To run the Rainar platform for development, you will need to have the following tools installed:

*   [Docker](https://www.docker.com/)
*   [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/)
*   [Skaffold](https://skaffold.dev/docs/install/)
*   A local Kubernetes cluster, such as [Minikube](https://minikube.sigs.k8s.io/docs/start/) or [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/)
*   An Ingress controller, such as the [NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/deploy/).

### GitHub OAuth App Setup

To enable GitHub integration, you will need to create a new GitHub OAuth App.

1.  Go to **Settings** > **Developer settings** > **OAuth Apps** on GitHub.
2.  Click **New OAuth App**.
3.  Fill in the application details:
    *   **Application name**: Rainar Dev
    *   **Homepage URL**: `http://localhost:3000`
    *   **Authorization callback URL**: `http://localhost:8080/api/auth/github/callback`
4.  Click **Register application**.
5.  On the next page, generate a new client secret.

You will then need to set the following environment variables:

*   `GITHUB_CLIENT_ID`: The "Client ID" of your OAuth App.
*   `GITHUB_CLIENT_SECRET`: The client secret you just generated.
*   `GITHUB_CALLBACK_URL`: The authorization callback URL you set above.

### Running the Platform

Once you have the required tools installed and the environment variables set, you can spin up the entire Rainar platform with a single command:

```bash
skaffold dev
```

This command will:

1.  Build the Docker images for all the microservices.
2.  Deploy the Kubernetes manifests to your local cluster.
3.  Stream the logs from all the running services to your terminal.
4.  Watch for changes to the source code and automatically redeploy the services when changes are detected.

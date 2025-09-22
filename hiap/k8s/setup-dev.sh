#!/bin/bash

# Development Environment Setup Script
# This script sets up the development environment in the same cluster

echo "Setting up HIAP Development Environment..."

# Note: Using same namespace (default) as production

# Apply development manifests
echo "Applying development manifests..."
kubectl apply -f k8s/deployment-dev.yml
kubectl apply -f k8s/service-dev.yml
kubectl apply -f k8s/persistent-volume-dev.yml

# Note: No ingress configured - use port-forward for access

echo "Development environment setup complete!"
echo ""
echo "To check the status:"
echo "  kubectl get pods -l app=hiap-dev"
echo "  kubectl get services -l app=hiap-dev"
echo ""
echo "To access the development service:"
echo "  kubectl port-forward service/hiap-service-dev 8080:8080"
echo ""
echo "To view logs:"
echo "  kubectl logs -l app=hiap-dev -f" 
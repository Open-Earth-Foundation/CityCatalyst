#!/bin/bash

# Development Environment Cleanup Script
# This script removes the development environment

echo "Cleaning up HIAP Development Environment..."

# Delete development resources
echo "Deleting development resources..."
kubectl delete -f k8s/deployment-dev.yml --ignore-not-found=true
kubectl delete -f k8s/service-dev.yml --ignore-not-found=true
kubectl delete -f k8s/persistent-volume-dev.yml --ignore-not-found=true

# Note: No ingress to clean up

# Note: All resources are in the default namespace

echo "Development environment cleanup complete!" 
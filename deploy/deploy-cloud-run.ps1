# Deploy GoLah! to Cloud Run in Singapore.
# Prerequisites: gcloud CLI, logged in, billing enabled.
# Usage:
#   $env:GCLOUD_PROJECT = "your-gcp-project"
#   $env:VITE_GOOGLE_MAPS_API_KEY = "your-maps-key"
#   .\deploy\deploy-cloud-run.ps1

$ErrorActionPreference = "Stop"
$Project = $env:GCLOUD_PROJECT
if (-not $Project) { $Project = gcloud config get-value project 2>$null }
if (-not $Project) { throw "Set GCLOUD_PROJECT or run: gcloud config set project YOUR_ID" }

$Region = if ($env:GCLOUD_REGION) { $env:GCLOUD_REGION } else { "asia-southeast1" }
$Service = "golah"
$MapsKey = $env:VITE_GOOGLE_MAPS_API_KEY
if (-not $MapsKey) { $MapsKey = "" }
$AdminPin = if ($env:ADMIN_PIN) { $env:ADMIN_PIN } else { "golah-admin" }
$Repo = "$Region-docker.pkg.dev/$Project/golah"

Write-Host "Enabling APIs and Artifact Registry..."
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com --project $Project
gcloud artifacts repositories describe golah --location $Region --project $Project 2>$null
if ($LASTEXITCODE -ne 0) {
  gcloud artifacts repositories create golah --repository-format=docker --location $Region --project $Project
}

$Image = "${Repo}/${Service}:$(Get-Date -Format yyyyMMdd-HHmmss)"
Write-Host "Building $Image"
gcloud builds submit $PSScriptRoot\.. --project $Project --config $PSScriptRoot\..\cloudbuild.yaml --substitutions "_MAPS_KEY=$MapsKey,_ADMIN_PIN=$AdminPin,_REGION=$Region,_SERVICE=$Service"

Write-Host "Done. Service URL:"
gcloud run services describe $Service --region $Region --project $Project --format="value(status.url)"

# Deploy GoLah! to Cloud Run in Singapore.
# Prerequisites: gcloud CLI, logged in, billing enabled.
# Usage:
#   $env:GCLOUD_PROJECT = "your-gcp-project"
#   $env:VITE_GOOGLE_MAPS_API_KEY = "your-maps-key"
#   .\deploy\deploy-cloud-run.ps1

# gcloud.ps1 writes status text to stderr; do not abort on that.
$ErrorActionPreference = "Continue"
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
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com storage.googleapis.com --project $Project --quiet
$repoName = (gcloud artifacts repositories describe golah --location $Region --project $Project --format="value(name)" 2>$null | Select-Object -Last 1)
if (-not $repoName) {
  Write-Host "Creating Artifact Registry repository golah..."
  gcloud artifacts repositories create golah --repository-format=docker --location $Region --project $Project --quiet
}

$Tag = Get-Date -Format "yyyyMMdd-HHmmss"
$Image = "${Repo}/${Service}:${Tag}"
Write-Host "Building $Image"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
gcloud builds submit $root --project $Project --quiet --config (Join-Path $root "cloudbuild.yaml") --substitutions "_MAPS_KEY=$MapsKey,_REGION=$Region,_SERVICE=$Service,_IMAGE_TAG=$Tag"
if ($LASTEXITCODE -ne 0) { throw "Cloud Build failed with exit code $LASTEXITCODE" }

$Bucket = if ($env:GOLAH_STORE_BUCKET) { $env:GOLAH_STORE_BUCKET } else { "golah-persist-$Project" }
Write-Host "Ensuring persist bucket gs://$Bucket ..."
gcloud storage buckets describe "gs://$Bucket" --project $Project 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  gcloud storage buckets create "gs://$Bucket" --project $Project --location $Region --uniform-bucket-level-access --quiet
}
$ProjectNumber = gcloud projects describe $Project --format="value(projectNumber)"
$RunSa = "$ProjectNumber-compute@developer.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding "gs://$Bucket" --member="serviceAccount:$RunSa" --role="roles/storage.objectAdmin" --quiet 1>$null

Write-Host "Deploying Cloud Run service $Service with durable store"
gcloud run deploy $Service --project $Project --quiet --image $Image --region $Region --platform managed --allow-unauthenticated --port 8080 --memory 1Gi --cpu 1 --timeout 300 --execution-environment gen2 --add-volume="name=golah-data,type=cloud-storage,bucket=$Bucket" --add-volume-mount="volume=golah-data,mount-path=/var/golah" --set-env-vars "HTTPS=0,ADMIN_PIN=$AdminPin,POSTAL_MAP_PATH=data/postal-map.json,STORE_PATH=/var/golah/store.json"

Write-Host "Done. Service URL:"
gcloud run services describe $Service --region $Region --project $Project --format="value(status.url)"

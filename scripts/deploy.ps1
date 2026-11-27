# Deploys origin/main to Vercel production from a clean worktree (never from the dev folder).
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$deploy = Join-Path (Split-Path -Parent $repo) 'receipts-deploy'

git -C $repo fetch origin
if (Test-Path $deploy) {
  git -C $deploy checkout --detach origin/main
  git -C $deploy reset --hard origin/main
} else {
  git -C $repo worktree add $deploy origin/main --detach
}
Write-Host "Deploying $(git -C $deploy log --oneline -1)"

Push-Location $deploy
try {
  if (-not (Test-Path .vercel\project.json)) { vercel link --yes --project receipts }
  vercel deploy --prod --yes
} finally { Pop-Location }
Write-Host 'Public URL: https://receipts-hex8.vercel.app'

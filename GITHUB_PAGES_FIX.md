# Fix GitHub Pages 404 Error

## Problem
The privacy policy at `https://sergei4k.github.io/fishingapp/privacy-policy.html` returns 404.

## Root Cause
The `.nojekyll` file is missing on the remote `mvp` branch. This file tells GitHub Pages to skip Jekyll processing and serve HTML files directly.

## Current Status
- ✅ `privacy-policy.html` exists on remote `mvp` branch
- ❌ `.nojekyll` is NOT on remote `mvp` branch (this is the problem!)

## Solution Options

### Option 1: Use the Script (Recommended)
Run the provided script to add `.nojekyll` via GitHub API:

```bash
./add-nojekyll.sh
```

You'll need a GitHub Personal Access Token:
1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Name: `github-pages-fix`
4. Scopes: Check `repo` (full control)
5. Generate and copy the token
6. Run the script and paste the token when prompted

### Option 2: GitHub Web Interface (Manual)
1. Go to: https://github.com/sergei4k/fishingapp/tree/mvp
2. Click "Add file" → "Create new file"
3. File name: `.nojekyll` (just the filename, leave content empty)
4. Scroll down, click "Commit new file" (commit directly to `mvp` branch)

### Option 3: Enable GitHub Pages First
Sometimes GitHub Pages needs to be enabled before files are accessible:

1. Go to: https://github.com/sergei4k/fishingapp/settings/pages
2. Source: Select `mvp` branch
3. Folder: `/ (root)`
4. Click Save
5. Wait 2-3 minutes for GitHub to build
6. Then add `.nojekyll` if still not working

## After Adding .nojekyll

1. Wait 2-3 minutes for GitHub Pages to rebuild
2. Visit: https://sergei4k.github.io/fishingapp/privacy-policy.html
3. If still 404, check:
   - GitHub Actions tab for build errors
   - Settings → Pages for the correct branch
   - Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)

## Verification

Check if `.nojekyll` is on remote:
```bash
git fetch origin
git show origin/mvp:.nojekyll
```

If this shows the file content (even if empty), it's there. If it shows an error, it's not.


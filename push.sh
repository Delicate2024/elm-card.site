#!/bin/bash

echo "============================="
echo "Script run at: $(date)"
echo "============================="

COMMIT_MESSAGE="auto: update"
BRANCH_NAME="master"
GITHUB_REMOTE="github"

echo "=== Starting Git Auto Push Script ==="
echo "Commit message: $COMMIT_MESSAGE"
echo "Branch: $BRANCH_NAME"
echo "GitHub remote: $GITHUB_REMOTE"

# 提交变更
echo "[1] Adding and committing changes..."
git add .
git commit -m "$COMMIT_MESSAGE"

echo "[2] Pushing to GitHub..."
git push $GITHUB_REMOTE "$BRANCH_NAME"

# 获取 GitHub 上最新 tag（只提取数字格式的）
echo "[3] Fetching tags from $GITHUB_REMOTE ..."
LATEST_TAG=$(git ls-remote --tags "$GITHUB_REMOTE" | \
  grep -oE 'refs/tags/[0-9]+\.[0-9]+' | sed 's/refs\/tags\///' | \
  sort -V | tail -n 1)

echo "Latest tag on remote is: $LATEST_TAG"

# 将版本号转为整数（*1000）以避免浮点问题
if [[ -z "$LATEST_TAG" ]]; then
    echo "No existing tag found, starting from 0.001"
    LATEST_INT=0
else
    LATEST_INT=$(echo "$LATEST_TAG" | awk -F. '{printf("%d", $1*1000 + $2)}')
    echo "Converted latest tag to integer: $LATEST_INT"
fi

# 计算新 tag 的整数形式并格式化为 X.XX
NEW_INT=$((LATEST_INT + 1))
NEW_TAG=$(printf "%d.%03d" $((NEW_INT / 1000)) $((NEW_INT % 1000)))

echo "Calculated new tag: $NEW_TAG"

# 检查远程是否已有该 tag
echo "[4] Checking if tag $NEW_TAG already exists on remote..."
if git ls-remote --tags "$GITHUB_REMOTE" | grep -q "refs/tags/$NEW_TAG"; then
    echo "Tag $NEW_TAG already exists on remote, skipping tag creation."
else
    echo "[5] Creating and pushing new tag: $NEW_TAG"
    git tag "$NEW_TAG"
    git push $GITHUB_REMOTE "$NEW_TAG"
    echo " Pushed to $BRANCH_NAME with tag $NEW_TAG"
fi

echo "Exit 10 seconds later"
sleep 10
exit

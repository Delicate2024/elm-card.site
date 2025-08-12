#!/bin/bash

echo "============================="
echo "Script run at: $(date)"
echo "============================="

# 拉取远程仓库的代码
git fetch origin

# 检查是否有更新
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse @{u})

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "Has updated to latest."
else
    echo "Local repository has updated. Pulling changes..."
    git pull origin master
fi

echo "Exit 10 seconds later"
sleep 10
exit
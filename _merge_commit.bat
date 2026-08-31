@echo off
cd /d c:\Users\frank\Desktop\Workspace\oef\CityCatalyst
git add -A
git commit -m "merge(develop): resolve conflicts in HiapApiService and validation"
git push origin HEAD
git status -sb

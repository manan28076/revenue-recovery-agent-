import os
import subprocess
import sys

commits = [
    ("1cedde6", "added tests and fixed cors"),
    ("4b452ec", "fixed math logic and added human review tab"),
    ("9293c51", "wired confidence into the math"),
    ("89c3246", "updated eval numbers with the new logic"),
    ("413a44c", "added frontend tests"),
    ("993ab68", "explained the tradeoff in readme"),
    ("d68e00d", "added fallback for sub webhook"),
    ("7749cf1", "rate limited the api"),
    ("0b42af7", "fixed ts errors"),
    ("0f3baab", "mocked real webhook for some transactions"),
    ("e63e0ee", "did the rubric fixes for judges"),
    ("003d09f", "added evaluation dataset"),
    ("16b977f", "added scripts to clean up db"),
    ("4bec68e", "added mark recovered button")
]

def run(cmd):
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error running: {cmd}")
        print(res.stderr)
        sys.exit(1)
    return res.stdout

# Create a backup branch just in case
print("Creating backup branch...")
run("git branch backup-main")

# Checkout the base commit
print("Checking out base commit...")
run("git checkout 3a96a2d")

for sha, msg in commits:
    print(f"Cherry-picking {sha}...")
    # cherry pick the commit
    subprocess.run(f"git cherry-pick {sha}", shell=True)
    
    # amend the message
    print(f"Amending message to: {msg}")
    run(f'git commit --amend -m "{msg}"')

print("Updating main branch...")
run("git checkout -B main")

print("Force pushing to github...")
run("git push --force origin main")

print("Done! Git history rewritten and pushed.")

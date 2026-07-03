# Turning soundgarden into a git submodule

soundgarden lives in its **own repository**
(`git@github.com:soulwax/soundgarden.git`) and is attached to the EchoWarrior
repo as a **submodule** at `tools/soundgarden/` — the same arrangement as
`tools/leitmotif`.

## Step 1 — push soundgarden to its remote (needs your SSH key)

```bash
cd d:/Workspace/Rust/EchoWarrior/tools/soundgarden
git remote add origin git@github.com:soulwax/soundgarden.git
git push -u origin main
```

## Step 2 — attach it as a submodule in the EchoWarrior repo

Because `tools/soundgarden/` already contains a git repo, first move it aside
so `git submodule add` can clone it cleanly from the remote:

```bash
cd d:/Workspace/Rust/EchoWarrior

# 1. Temporarily move the local working copy out of the way.
mv tools/soundgarden tools/soundgarden.local

# 2. Add the submodule (clones from the remote you just pushed to).
git submodule add git@github.com:soulwax/soundgarden.git tools/soundgarden

# 3. Verify it matches, then remove the local copy.
#    (They should be identical since you just pushed it.)
rm -rf tools/soundgarden.local

# 4. Commit the submodule link in the parent repo.
git add .gitmodules tools/soundgarden
git commit -m "chore: add soundgarden audio studio as a submodule at tools/soundgarden"
```

## Step 3 — how others clone

```bash
git clone --recurse-submodules <echowarrior-url>
# or, in an existing clone:
git submodule update --init --recursive
```

## Alternative (simpler, if you prefer no move)

If you'd rather not move the folder: delete the local `.git` inside
`tools/soundgarden/` (after Step 1's push), then run `git submodule add ...` —
git will clone fresh from the remote into the empty path. The move approach
above is safer because it keeps your working copy until you've verified the
remote.

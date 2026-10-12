"""Copy the working tree (/home/claude/nobel) into the homepage repo's nobel-lab/ folder and build the
GitHub Pages files there. Sources go to nobel-lab/src + build.py; builder briefs and test tools go to
nobel-lab/_dev (Jekyll does not publish folders whose names start with '_')."""
import shutil, pathlib, subprocess
DEV = pathlib.Path('/home/claude/nobel')
REPO = pathlib.Path('/home/claude/zechenbian.github.io/nobel-lab')
REPO.mkdir(parents=True, exist_ok=True)
shutil.rmtree(REPO / 'src', ignore_errors=True)
shutil.copytree(DEV / 'src', REPO / 'src', ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
shutil.copy2(DEV / 'build.py', REPO / 'build.py')
dev = REPO / '_dev'
shutil.rmtree(dev, ignore_errors=True)
(dev / 'tools').mkdir(parents=True)
for f in sorted(DEV.glob('*_CONTRACT.md')):
    shutil.copy2(f, dev / f.name)
for f in sorted((DEV / 'tools').iterdir()):
    if f.is_file() and f.suffix in ('.py', '.js'):
        shutil.copy2(f, dev / 'tools' / f.name)
shutil.copy2(DEV / 'sync_repo.py', dev / 'sync_repo.py')
subprocess.run(['python3', str(REPO / 'build.py'), '--github', str(REPO)], check=True)

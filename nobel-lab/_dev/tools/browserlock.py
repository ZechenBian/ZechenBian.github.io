"""Shared lock so only ONE headless browser runs at a time across all builders (2 CPUs / 8 GB machine).
Usage in your own Playwright scripts:
    import sys; sys.path.insert(0, '/home/claude/nobel/tools')
    from browserlock import browser_lock
    with browser_lock():
        with sync_playwright() as p: ...
Or from the shell:  flock /tmp/nobel-browser.lock python3 your_script.py
"""
import fcntl, contextlib, time
@contextlib.contextmanager
def browser_lock(path='/tmp/nobel-browser.lock'):
    f = open(path, 'w'); t0 = time.time()
    fcntl.flock(f, fcntl.LOCK_EX)
    waited = time.time() - t0
    if waited > 5: print(f'[browser_lock] waited {waited:.0f}s for the shared browser slot')
    try: yield
    finally: fcntl.flock(f, fcntl.LOCK_UN); f.close()

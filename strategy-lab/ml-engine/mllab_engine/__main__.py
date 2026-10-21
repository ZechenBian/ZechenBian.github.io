# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""命令行入口：python -m mllab_engine [--port 8765] [--page 页面文件] [--no-browser]"""
import argparse
import sys
import threading
import webbrowser


def _stop_on_signals():
    """kill（SIGTERM）、关掉终端（SIGHUP）也像 Ctrl+C 一样收尾：先杀掉正在跑的子进程再退出。
    Ctrl+C 被忽略的环境里（例如后台启动），把它也恢复成正常的"中断"。"""
    import signal

    names = ("SIGTERM", "SIGHUP", "SIGINT")

    def stop(signum, frame):
        for nm in names:               # 收尾只要一两秒：这期间再按 Ctrl+C 就不理了，免得收尾被打断
            sg = getattr(signal, nm, None)
            if sg is not None:
                try:
                    signal.signal(sg, signal.SIG_IGN)
                except (ValueError, OSError):
                    pass
        raise KeyboardInterrupt
    for name in names:
        sig = getattr(signal, name, None)
        if sig is not None:
            try:
                signal.signal(sig, stop)
            except (ValueError, OSError):
                pass


def main(argv=None):
    if sys.version_info < (3, 10):
        print("需要 Python 3.10 或更新的版本，现在是 %d.%d。见 README 的安装一节。" % sys.version_info[:2])
        return 2
    from . import __version__
    from .server import Engine
    ap = argparse.ArgumentParser(prog="python -m mllab_engine", description="机器学习实验室 · 本机 Python 引擎：在这台电脑上用 Python / PyTorch 运行算法。")
    ap.add_argument("--port", type=int, default=8765, help="端口（默认 8765；被占用时自动用下一个空闲的）")
    ap.add_argument("--page", metavar="PATH", help="页面文件（默认是仓库里的 strategy-lab/ml/index.html）")
    ap.add_argument("--no-browser", action="store_true", help="不自动打开浏览器（自己复制网址打开）")
    ap.add_argument("--version", action="version", version="mllab-engine " + __version__)
    args = ap.parse_args(argv)
    if not (0 <= args.port <= 65535):
        ap.error("端口要在 0 到 65535 之间")

    eng = Engine(port=args.port, page=args.page)
    try:
        port = eng.bind()
    except OSError as e:
        print("开不了端口 %d：%s。换一个试试：python -m mllab_engine --port 9000" % (args.port, e))
        return 1
    print("机器学习实验室 · 本机 Python 引擎 %s" % __version__)
    if args.port and port != args.port:
        print("端口 %d 被占用了，改用 %d。" % (args.port, port))
    from .server import dist_version
    np_ver = dist_version("numpy")
    print("Python %d.%d.%d · numpy %s" % (sys.version_info[:3] + (np_ver or "（没装！先 pip install numpy）",)))
    import importlib.util
    if importlib.util.find_spec("torch") is not None:
        print("正在检查 PyTorch……", flush=True)
    t = eng.torch_info()
    if t.get("available"):
        dev = {"mps": "苹果芯片 GPU（MPS）", "cuda": "NVIDIA GPU（CUDA）", "cpu": "CPU"}.get(t.get("device"), t.get("device"))
        print("PyTorch %s · 计算设备：%s" % (t.get("version"), dev))
    else:
        print("没有 PyTorch：只能运行 numpy 写的算法。要用 PyTorch 见 README（pip install torch）。")
    path, explicit = eng.page_path()
    import os
    print("页面：%s%s" % (path, "" if os.path.isfile(path) else "（还没有构建：在 strategy-lab 目录里运行 python3 build.py）"))
    print("")
    print("在浏览器里打开（只有这台电脑能访问；网址里的令牌每次启动都不一样，别发给别人）：")
    print("  " + eng.url)
    print("")
    print("停止引擎：在这个终端里按 Ctrl+C。")
    sys.stdout.flush()
    if not args.no_browser:
        threading.Timer(0.4, lambda: webbrowser.open(eng.url)).start()
    _stop_on_signals()
    try:
        eng.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        eng.close()
        try:
            print("\n引擎已停止。", flush=True)
        except (OSError, ValueError):
            pass                       # 终端已经关了
    return 0


if __name__ == "__main__":
    sys.exit(main())

# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""替页面从网上取一个数据文件（POST /api/fetch）。

浏览器只能直接读"允许跨域"的网站；别的网站（很多政府、交易所、大学的数据下载地址）浏览器读不到，
引擎在本机用普通的 HTTP 请求去取，再把原始字节交回页面（解压、解析、导入都在页面里做）。

为了不被借去访问你家里或公司内网的设备：
  * 只接受 http:// 和 https://；
  * 主机名解析出来的每个地址都必须是公网地址（不是 127.x、10.x、192.168.x、169.254.x、::1、fc00::/7 ……），
    每一次重定向的目标也重新检查；
  * 不带 Cookie、不带任何你的登录信息；最多 50 MB，30 秒超时，最多 5 次重定向。
测试用的本机数据服务器要放行私有地址时，设环境变量 MLLAB_ALLOW_PRIVATE_FETCH=1。
"""
import ipaddress
import os
import socket
import urllib.error
import urllib.parse
import urllib.request

MAX_BYTES = 50 * 2 ** 20
TIMEOUT_S = 30
MAX_REDIRECTS = 5


class FetchError(Exception):
    """给页面看的错误：message 是一句中文"""

    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def allow_private():
    return os.environ.get("MLLAB_ALLOW_PRIVATE_FETCH", "") == "1"


def _check_host(url):
    p = urllib.parse.urlsplit(url)
    if p.scheme not in ("http", "https"):
        raise FetchError("只能取 http:// 或 https:// 开头的地址。")
    host = p.hostname
    if not host:
        raise FetchError("地址里没有主机名。")
    if p.username or p.password:
        raise FetchError("地址里不能带用户名和密码。")
    if allow_private():
        return
    port = p.port or (443 if p.scheme == "https" else 80)
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        raise FetchError("找不到这个网站（%s）：%s" % (host, e))
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if not ip.is_global or ip.is_multicast:
            raise FetchError("不取内网或本机的地址（%s 解析到 %s）：引擎只替页面取公网上的数据。" % (host, ip))


class _Redirect(urllib.request.HTTPRedirectHandler):
    """每一次重定向都重新检查目标；最多 MAX_REDIRECTS 次"""

    max_redirections = MAX_REDIRECTS

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        newurl = urllib.parse.urljoin(req.full_url, newurl)
        _check_host(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, max_bytes=MAX_BYTES, timeout=TIMEOUT_S, version="0"):
    """取 url 的内容。返回 {status, url（重定向之后的）, contentType, bytes, data（bytes）}；出错抛 FetchError"""
    if not isinstance(url, str) or len(url) > 4000:
        raise FetchError("地址不对。")
    url = url.strip()
    _check_host(url)
    opener = urllib.request.build_opener(_Redirect(), urllib.request.HTTPSHandler(), urllib.request.HTTPHandler())
    opener.addheaders = []
    req = urllib.request.Request(url, headers={"User-Agent": "mllab-engine/%s (machine-learning lab; local)" % version, "Accept": "*/*", "Accept-Encoding": "identity"})
    try:
        with opener.open(req, timeout=timeout) as r:
            status = r.status
            final = r.geturl()
            ctype = r.headers.get("Content-Type", "")
            declared = r.headers.get("Content-Length")
            if declared and declared.isdigit() and int(declared) > max_bytes:
                raise FetchError("文件太大（%.0f MB），最多 %.0f MB。" % (int(declared) / 2 ** 20, max_bytes / 2 ** 20))
            chunks, n = [], 0
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                n += len(b)
                if n > max_bytes:
                    raise FetchError("文件太大，超过了 %.0f MB。" % (max_bytes / 2 ** 20))
                chunks.append(b)
            return {"status": status, "url": final, "contentType": ctype, "bytes": n, "data": b"".join(chunks)}
    except FetchError:
        raise
    except urllib.error.HTTPError as e:
        raise FetchError("网站回答 HTTP %d（%s）。" % (e.code, e.reason), status=e.code)
    except urllib.error.URLError as e:
        reason = e.reason
        if isinstance(reason, FetchError):
            raise reason
        raise FetchError("连不上：%s" % reason)
    except (socket.timeout, TimeoutError):
        raise FetchError("等了 %d 秒没有取完，放弃了。" % timeout)
    except OSError as e:
        raise FetchError("取的时候出错了：%s" % e)


from io import StringIO
import socket
import qrcode


def size_convert(size):
    kb = size / 1024
    if kb < 1:
        return "%db" % size
    M = kb / 1024
    if M < 1:
        return "%0.2fKb" % kb
    G = M / 1024
    if G < 1:
        return "%0.2fM" % M
    return "%0.2fG" % G


def get_host_ip():
    """
    查询本机ip地址
    :return:
    """
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    finally:
        s.close()

    return ip


def show_qrcode(data):
    qr = qrcode.QRCode(version=3, box_size=10, border=4)
    qr.add_data(data)
    qr.make()
    qr.print_ascii()
    # img = qr.make_image()
    # img.show()
    qr.clear()


shared_stringio = StringIO()


def write_data(data):
    shared_stringio.seek(0)
    shared_stringio.write(data)
    shared_stringio.truncate()  # 截断当前位置之后的内容
    shared_stringio.seek(0)  # 重置文件指针到开头，确保下次读取时能读到完整内容


def read_data():
    return shared_stringio.getvalue()

"""Small read-only HTML tree for official FIS result pages; no browser needed."""
from html.parser import HTMLParser


class Node:
    def __init__(self, tag="root", attrs=(), parent=None):
        self.tag = tag
        self.attrs = dict(attrs)
        self.parent = parent
        self.children = []

    def text(self):
        return " ".join(" ".join(c.text() if isinstance(c, Node) else c for c in self.children).split())

    def find_all(self, tag=None, cls=None, attr=None):
        found = []
        for child in self.children:
            if not isinstance(child, Node):
                continue
            if ((not tag or child.tag == tag)
                and (not cls or cls in child.attrs.get("class", "").split())
                and (not attr or all(k in child.attrs and (v is None or child.attrs[k] == v) for k, v in attr.items()))):
                found.append(child)
            found.extend(child.find_all(tag, cls, attr))
        return found

    def one(self, **kwargs):
        found = self.find_all(**kwargs)
        return found[0] if found else None


class TreeParser(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.current = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.current)
        self.current.children.append(node)
        if tag not in self.VOID:
            self.current = node

    def handle_startendtag(self, tag, attrs):
        self.current.children.append(Node(tag, attrs, self.current))

    def handle_endtag(self, tag):
        node = self.current
        while node.parent:
            if node.tag == tag:
                self.current = node.parent
                return
            node = node.parent

    def handle_data(self, data):
        if self.current.tag not in {"script", "style"}:
            self.current.children.append(data)


def parse_html(html):
    parser = TreeParser()
    parser.feed(html)
    return parser.root

"""Read the public FIS timing wire format without executing serialized objects."""


def deserialize(xml):
    raw = xml.strip()
    if not raw.startswith("<lt>") or not raw.endswith("</lt>"):
        raise ValueError("Invalid FIS timing envelope")
    data = raw[4:-5].replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").replace("&apos;", "'")
    position = 0

    def take_until(separator):
        nonlocal position
        end = data.index(separator, position)
        value = data[position:end]
        position = end + len(separator)
        return value

    def parse(depth=0):
        nonlocal position
        if depth > 30:
            raise ValueError("FIS payload too deeply nested")
        kind = data[position]
        position += 2
        if kind == "N":
            return None
        if kind in "ibd":
            value = take_until(";")
            return bool(int(value)) if kind == "b" else (int(value) if kind == "i" else float(value))
        if kind == "s":
            length = int(take_until(":"))
            if data[position:position+1] != '"':
                raise ValueError("Invalid string")
            position += 1
            value = data[position:position+length]
            position += length
            if data[position:position+2] != '";':
                raise ValueError("Invalid timing string length")
            position += 2
            return value
        if kind == "a":
            count = int(take_until(":"))
            if count > 20000 or data[position:position+1] != "{":
                raise ValueError("Invalid array")
            position += 1
            value = {}
            for _ in range(count):
                key = parse(depth+1)
                value[key] = parse(depth+1)
            if data[position:position+1] != "}":
                raise ValueError("Invalid array ending")
            position += 1
            return value
        raise ValueError("Unsupported serialized type")

    result = parse()
    if position != len(data):
        raise ValueError("Trailing FIS payload")
    return result

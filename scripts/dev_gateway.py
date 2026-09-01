from http.client import HTTPConnection
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
from urllib.parse import quote, unquote, urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist"

class Gateway(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def _proxy(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        conn = HTTPConnection("127.0.0.1", 8001, timeout=120)
        headers = {k: v for k, v in self.headers.items() if k.lower() not in {"host", "connection"}}
        conn.request(self.command, self.path, body=body, headers=headers)
        response = conn.getresponse()
        self.send_response(response.status)
        for key, value in response.getheaders():
            if key.lower() not in {"connection", "transfer-encoding"}:
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(response.read())
        conn.close()

    def do_GET(self):
        if self.path.startswith(("/people/wikidata-", "/animal-image/")):
            qid = (self.path.rsplit("wikidata-", 1)[1] if "wikidata-" in self.path else self.path.rsplit("/", 1)[1]).split(".", 1)[0]
            request = Request(
                f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json",
                headers={"User-Agent": "FestivalLookalike/0.2"},
            )
            data = json.load(urlopen(request, timeout=15))
            filename = data["entities"][qid]["claims"]["P18"][0]["mainsnak"]["datavalue"]["value"]
            self.send_response(302)
            self.send_header("Location", f"https://commons.wikimedia.org/wiki/Special:Redirect/file/{quote(filename)}")
            self.end_headers()
            return
        if self.path.startswith("/character-image/"):
            slug = unquote(self.path.split("/character-image/", 1)[1].split("?", 1)[0])
            if slug in {"Eren_Yeager", "Levi_Ackerman", "Mikasa_Ackerman"}:
                wiki = "attackontitan.fandom.com"
            elif slug in {"Tanjiro_Kamado", "Nezuko_Kamado", "Zenitsu_Agatsuma", "Inosuke_Hashibira", "Kyojuro_Rengoku"}:
                wiki = "kimetsu-no-yaiba.fandom.com"
            else:
                wiki = "onepiece.fandom.com"
            query = urlencode({
                "action": "query", "prop": "pageimages", "piprop": "thumbnail|original",
                "pithumbsize": 700, "titles": slug.replace("_", " "), "format": "json",
            })
            request = Request(
                f"https://{wiki}/api.php?{query}",
                headers={"User-Agent": "FestivalLookalike/0.2"},
            )
            data = json.load(urlopen(request, timeout=15))
            page = next(iter(data["query"]["pages"].values()))
            image = page.get("thumbnail", page.get("original", {})).get("source")
            if not image:
                return self.send_error(404, "Character image unavailable")
            self.send_response(302)
            self.send_header("Location", image)
            self.end_headers()
            return
        if self.path.startswith(("/api/", "/people/")):
            return self._proxy()
        if self.path == "/" or not (DIST / self.path.lstrip("/").split("?", 1)[0]).is_file():
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        return self._proxy() if self.path.startswith("/api/") else self.send_error(404)

if __name__ == "__main__":
    print("Festival gateway: http://127.0.0.1:8080", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8080), Gateway).serve_forever()

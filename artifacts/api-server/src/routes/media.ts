import { Router } from "express";
import path from "path";
import fs from "fs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const MEDIA_DIR = path.join(DATA_DIR, "media");

const MIME: Record<string, string> = {
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".webp": "image/webp",
  ".gif":  "image/gif",
  ".ogg":  "audio/ogg; codecs=opus",
  ".oga":  "audio/ogg",
  ".opus": "audio/ogg; codecs=opus",
  ".m4a":  "audio/mp4",
  ".aac":  "audio/aac",
  ".mp3":  "audio/mpeg",
  ".wav":  "audio/wav",
  ".mp4":  "video/mp4",
  ".webm": "video/webm",
  ".pdf":  "application/pdf",
};

const router = Router();

router.get("/media/:filename", (req, res): void => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(MEDIA_DIR, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Mídia não encontrada" });
    return;
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = MIME[ext] ?? "application/octet-stream";

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.status(500).json({ error: "Erro ao acessar o arquivo" });
    return;
  }

  const fileSize = stat.size;
  const rangeHeader = req.headers.range;

  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? Math.min(parseInt(parts[1], 10), fileSize - 1) : fileSize - 1;

    if (isNaN(start) || start >= fileSize || start > end) {
      res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
      return;
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      "Content-Range":  `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges":  "bytes",
      "Content-Length": chunkSize,
      "Content-Type":   contentType,
      "Cache-Control":  "public, max-age=86400",
    });
    fs.createReadStream(filePath, { start, end }).pipe(res as any);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type":   contentType,
      "Accept-Ranges":  "bytes",
      "Cache-Control":  "public, max-age=86400",
    });
    fs.createReadStream(filePath).pipe(res as any);
  }
});

export default router;

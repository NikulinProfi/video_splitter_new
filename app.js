const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const app = express();
const upload = multer({ dest: 'static/uploads/' });

app.use(express.static('static'));
app.set('views', './templates');
app.set('view engine', 'ejs');

const segmentDuration = 5;

app.get('/', (req, res) => {
    res.render('index', { videoName: null });
});

app.post('/upload', upload.single('file'), (req, res) => {
    const inputPath = req.file.path;
    const videoName = req.file.originalname.split('.')[0];
    const outputDir = path.join('segments', videoName);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
            console.error(err);
            return res.send('Ошибка обработки видео');
        }

        const duration = metadata.format.duration;
        const numSegments = Math.ceil(duration / segmentDuration);

        const outputPattern = path.join(outputDir, 'segment_%03d.mp4');

        ffmpeg(inputPath)
            .output(outputPattern)
            .outputOptions([
                `-f segment`,
                `-segment_time ${segmentDuration}`,
                `-reset_timestamps 1`,
                `-force_key_frames expr:gte(t,n_forced*${segmentDuration})`,
                `-c:v libx264`,
                `-c:a aac`,
                `-map 0:v`,
                `-map 0:a?`
            ])
            .on('end', () => {
                res.render('index', { videoName });
            })
            .on('error', (err) => {
                console.error(err);
                res.send('Ошибка разделения видео');
            })
            .run();
    });
});

app.get('/download/:videoName', (req, res) => {
    const videoName = req.params.videoName;
    const outputDir = path.join('segments', videoName);
    const zipPath = path.join('segments', `${videoName}.zip`);

    if (!fs.existsSync(outputDir)) {
        return res.status(404).send('Сегменты не найдены');
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const output = fs.createWriteStream(zipPath);

    archive.directory(outputDir, false);
    archive.pipe(output);

    archive.on('error', (err) => {
        console.error(err);
        res.status(500).send('Ошибка создания архива');
    });

    output.on('close', () => {
        res.download(zipPath, `${videoName}_segments.zip`, (err) => {
            if (err) {
                console.error(err);
            }
            // Удаляем временный ZIP-файл
            fs.unlinkSync(zipPath);
        });
    });

    archive.finalize();
});

app.listen(3000, () => {
    console.log('Server running at http://localhost:3000');
});
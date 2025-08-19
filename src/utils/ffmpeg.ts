import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export const loadFFmpeg = async (): Promise<FFmpeg> => {
    if (ffmpeg) {
        return ffmpeg;
    }
    ffmpeg = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    
    // Listening for log messages is useful for debugging
    ffmpeg.on('log', ({ message }) => {
        console.log('[FFMPEG Log]', message);
    });

    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    return ffmpeg;
};

export const compressVideo = async (
    videoFile: File,
    progressCallback: (progress: number) => void
): Promise<File> => {
    const ffmpegInstance = await loadFFmpeg();

    ffmpegInstance.on('progress', ({ progress }) => {
        // Progress can sometimes go slightly above 1, so cap it.
        progressCallback(Math.min(Math.round(progress * 100), 100));
    });

    const inputFileName = `input.${videoFile.name.split('.').pop() || 'mov'}`;
    await ffmpegInstance.writeFile(inputFileName, await fetchFile(videoFile));

    // Command breakdown:
    // -i <input>: specifies the input file.
    // -c:v libx264: uses the H.264 video codec, which has wide support.
    // -preset veryfast: optimizes for speed over compression ratio, crucial for browser performance.
    // -crf 28: Constant Rate Factor. Lower is higher quality. 23 is visually lossless, 28 is a good compromise for web video size.
    // -c:a aac: uses the AAC audio codec.
    // -b:a 128k: sets audio bitrate to 128kbps.
    // -movflags +faststart: ensures the video metadata is at the start of the file for faster web playback.
    // output.mp4: the output file name.
    await ffmpegInstance.exec([
        '-i', inputFileName,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        'output.mp4'
    ]);

    const data = await ffmpegInstance.readFile('output.mp4');
    
    // Clean up the in-memory filesystem
    await ffmpegInstance.deleteFile(inputFileName);
    await ffmpegInstance.deleteFile('output.mp4');
    
    // Detach the progress listener to avoid memory leaks
    ffmpegInstance.off('progress', () => {});

    // The Uint8Array from ffmpeg might be backed by a SharedArrayBuffer, which isn't a valid BlobPart in some environments.
    // Creating a new Uint8Array from it forces a copy into a regular ArrayBuffer, which is compatible.
    const compressedBlob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
    
    const originalName = videoFile.name.substring(0, videoFile.name.lastIndexOf('.'));
    const newFileName = `${originalName}_compressed.mp4`;

    return new File([compressedBlob], newFileName, { type: 'video/mp4' });
};